import { ProductStatus } from "@prisma/client";
import type { UpdateProductDto } from "../dto/update-product.dto";
import type { ProductUpdateActor } from "./product-update-actor";

/**
 * Bir düzenleme sonrasında ilanın statüsü NE OLMALI — tek karar yeri.
 *
 * `undefined` "statüye dokunma" demektir. Politika saf bir hesap olduğu için
 * servisten ayrı durur: statü kuralları para kadar sık tartışılıyor ve Nest
 * kablolaması olmadan okunabilir/test edilebilir olmaları gerekiyor.
 */
export function resolveUpdatedStatus(
  product: { status: ProductStatus; quantity: number | null },
  dto: UpdateProductDto,
  actor: ProductUpdateActor,
): ProductStatus | undefined {
  const requested = dto.status;
  const newQuantity =
    dto.quantity !== undefined
      ? dto.quantity === null
        ? null
        : Number(dto.quantity)
      : product.quantity;

  // Yönetici düzenlemesi statüyü DEĞİŞTİRMEZ: onaylı ilan onaylı kalır,
  // yeniden incelemeye düşmez. Onaylama/reddetme ayrı uçların işidir.
  // Tek istisna bütünlük kuralıdır — stoğu biten ilan satışta kalamaz.
  if (actor.kind === "admin") {
    return newQuantity === 0 && product.status === ProductStatus.active
      ? ProductStatus.inactive
      : undefined;
  }

  // Satıcı kendi ilanını pasife alabilir.
  if (requested === ProductStatus.inactive) {
    return ProductStatus.inactive;
  }

  // Reddedilen ürün düzenlenince otomatik yeniden incelemeye girer.
  if (product.status === ProductStatus.rejected) {
    return ProductStatus.pending;
  }

  // Satıcı DOĞRUDAN aktifleştiremez: aktif olmayan bir ilanı aktif etme isteği
  // admin onayına (pending) yönlendirilir. Zaten aktif ilanda statü değişmez.
  if (
    requested === ProductStatus.active &&
    product.status !== ProductStatus.active
  ) {
    return ProductStatus.pending;
  }

  // Aktif ilanın stoğu 0'a düşerse otomatik pasif.
  if (newQuantity === 0 && product.status === ProductStatus.active) {
    return ProductStatus.inactive;
  }

  // Diğer tüm izinsiz/anlamsız statü istekleri yok sayılır (statü değişmez).
  return undefined;
}
