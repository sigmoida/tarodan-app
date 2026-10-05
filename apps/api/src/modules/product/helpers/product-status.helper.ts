import { ProductInactiveReason, ProductStatus } from "@prisma/client";
import { isListingRemovedStatus } from "@tarodan/types";

/**
 * quantity'dan product status belirler.
 * - quantity === null: sınırsız stok → ACTIVE
 * - quantity > 0: stok var → ACTIVE
 * - quantity === 0: stok bitti → INACTIVE
 */
export function getProductStatusFromQuantity(
  quantity: number | null,
): ProductStatus {
  if (quantity === null) {
    return ProductStatus.active;
  }
  return quantity > 0 ? ProductStatus.active : ProductStatus.inactive;
}

/**
 * Rezerv-duyarlı status (Bulgu C). Rezervasyon serbest bırakma yollarında
 * (timeout cron'ları) kullanılır. Status'u `available = quantity - reserved`'a göre verir:
 * - quantity === null (sınırsız) → ACTIVE (asla "reserved"a düşmez).
 * - available > 0 → ACTIVE (hâlâ satılabilir; rezerv kalsa bile gizleme).
 * - available <= 0 && quantity > 0 → RESERVED (rezerv tutuyor, geçici görünmez).
 * - available <= 0 && quantity === 0 → INACTIVE (gerçekten tükendi; "reserved" limbosu DEĞİL).
 *
 * Eski satır-içi ternary `newReserved > 0 ? reserved : (remaining > 0 ? active : reserved)`
 * quantity=0 ve quantity=null durumlarında yanlışlıkla "reserved" üretiyordu.
 */
export function getReservedAwareStatus(
  quantity: number | null,
  reservedQuantity: number,
): ProductStatus {
  if (quantity === null) {
    return ProductStatus.active;
  }
  const available = quantity - reservedQuantity;
  if (available > 0) {
    return ProductStatus.active;
  }
  return quantity > 0 ? ProductStatus.reserved : ProductStatus.inactive;
}

/**
 * İade edilen stok karantinaya mı girmeli? PO kararı: "İade edilen ürün otomatik
 * stoğa döner ama hasarlı olabilir; ilan PASİF kalmalı, satıcı kendisi inceleyip
 * aktive eder." Adet ne olursa olsun (çok adetli ilanda da) tüm ilan pasife
 * düşer — kullanılabilirlikten önce güvenlik gelir.
 *
 * Tek sinyal: `Order.deliveredAt`. Bu alan yalnız TEK kanonik yoldan
 * (`PaymentHoldReleaseService.handleOrderDelivered` — webhook/poller/admin
 * hangisinden gelirse gelsin) damgalanır, bu yüzden "ürün alıcıya fiilen ulaştı
 * mı" sorusunun tek güvenilir cevabı budur:
 * - null  → sipariş hiç teslim edilmedi (kargo/ödeme öncesi iptal) → ürün
 *           alıcının eline hiç geçmedi → eski davranış (miktardan status).
 * - dolu  → teslim SONRASI iade → miktar geri yüklenir ama status karantinada.
 */
export function shouldQuarantineReturnedStock(
  deliveredAt: Date | null,
): boolean {
  return deliveredAt !== null;
}

/**
 * `Product.inactiveReason` (bkz. şema) yalnız `return_quarantine` iken anlamlı:
 * satıcı `inactive` bir ilanı DOĞRUDAN (admin onayı olmadan) aktive edebilir
 * — bkz. `resolveUpdatedStatus`. Bayat bir işaret bu ayrıcalığı yanlış ilana
 * (elle pasife alınmış veya moderasyonca reddedilmiş) sızdırabileceğinden,
 * ilan `inactive` DIŞINA çıkan HER yazımda temizlenmeli.
 *
 * Tek entegrasyon noktası: `PrismaService`'in Product middleware'i (bkz.
 * `registerProductInactiveReasonGuardMiddleware`), ~30 ayrı `status` yazıcısını
 * (trade/payment/admin/moderation/scheduler) tek tek dolaşıp değiştirmek yerine
 * her Product `update`/`updateMany` çağrısının `data`sına burada uygulanır. Çağıran
 * `inactiveReason`'ı AYNI yazımda zaten belirtmişse (ör. payment-refund'ın
 * karantina yolu) dokunulmaz — çağıranın niyeti her zaman kazanır.
 */
export function clearStaleInactiveReasonOnWrite(
  data: Record<string, unknown> | undefined,
): void {
  if (!data) return;
  if (!Object.prototype.hasOwnProperty.call(data, "status")) return;
  if (data.status === ProductStatus.inactive) return;
  if (Object.prototype.hasOwnProperty.call(data, "inactiveReason")) return;
  data.inactiveReason = null;
}

/**
 * `Product.removalReason` (bkz. şema) ilan vitrinden düşmüşken anlamlıdır.
 * İlan kaldırma statülerinin (inactive/deleted/rejected/suspended) DIŞINA
 * çıktığında — yeniden yayın, onaya gönderme, satış, rezervasyon — güncel
 * neden artık yoktur; bayat bir neden admin listesinde "vitrinde ama
 * kaldırılmış" gibi okunurdu.
 *
 * Aynı tek entegrasyon noktası (Product middleware'i): ilanı vitrine
 * döndüren ~30 yazıcıyı tek tek dolaşmak yerine her Product
 * `update`/`updateMany`'ye uygulanır. Kaldırma statüsüne yapılan yazımlara
 * DOKUNMAZ — nedeni o yazımın ardından `recordListingRemovals` damgalar;
 * aynı statünün yeniden yazılması (ör. stok yeniden hesabı) mevcut nedeni
 * silmemelidir. Çağıran `removalReason`ı aynı yazımda belirtmişse çağıranın
 * niyeti kazanır.
 */
export function clearStaleRemovalReasonOnWrite(
  data: Record<string, unknown> | undefined,
): void {
  if (!data) return;
  if (!Object.prototype.hasOwnProperty.call(data, "status")) return;
  // `status: undefined` Prisma'da "dokunma" demektir — statü değişmiyor.
  if (data.status === undefined) return;
  if (isListingRemovedStatus(data.status)) return;
  if (Object.prototype.hasOwnProperty.call(data, "removalReason")) return;
  data.removalReason = null;
}

/**
 * İptal/iade sonrası stok GERİ YÜKLENİRKEN ilanın yeni durumu — tek karar yeri.
 *
 * - Bu iade teslimat SONRASI ise (`quarantine=true`) ilan karantinaya alınır.
 * - İlan zaten BAŞKA bir iadeden karantinadaysa (inactive + return_quarantine),
 *   teslimat öncesi bir iptal onu satışa geri açmaz: iade gelen (hasarlı
 *   olabilecek) birim satıcı incelemeden satılmasın.
 * - Aksi halde eski davranış: durum miktardan.
 */
export function statusAfterStockRestore(
  current: {
    status: ProductStatus;
    inactiveReason: ProductInactiveReason | null;
  },
  newQuantity: number | null,
  quarantine: boolean,
): { status: ProductStatus; inactiveReason: ProductInactiveReason | null } {
  const alreadyQuarantined =
    current.status === ProductStatus.inactive &&
    current.inactiveReason === ProductInactiveReason.return_quarantine;
  if (quarantine || alreadyQuarantined) {
    return {
      status: ProductStatus.inactive,
      inactiveReason: ProductInactiveReason.return_quarantine,
    };
  }
  return {
    status: getProductStatusFromQuantity(newQuantity),
    inactiveReason: null,
  };
}
