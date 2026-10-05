import { ListingRemovalReason, Prisma, ProductStatus } from "@prisma/client";
import { isListingRemovedStatus } from "@tarodan/types";

/**
 * Bir ilanın vitrinden düşüşü — kim, hangi nedenle, hangi statüden hangisine.
 *
 * `statusBefore`/`statusAfter` çağıranın OKUDUĞU ve YAZDIĞI statülerdir; geçiş
 * gerçekten bir kaldırma değilse (yeni statü kaldırma statüsü değil ya da
 * statü değişmedi) kayıt düşülmez — çağıran stoktan türetilen statü gibi
 * "kaldırma olabilir de olmayabilir de" bir yazımdan sonra koşulsuz çağırabilir.
 */
export interface ListingRemovalEntry {
  productId: string;
  statusBefore: ProductStatus;
  statusAfter: ProductStatus;
  reason: ListingRemovalReason;
  /** `sold_elsewhere`: satışın gerçekleştiği platform kodu. */
  platform?: string | null;
  /** `policy_violation`: ihlal kodu (kodsuz eski red için null). */
  violationCode?: string | null;
  /** Satıcının notu / yöneticinin açıklaması — yalnız admin uçları okur. */
  detail?: string | null;
  /** Satıcı ya da yönetici; sistem işlerinde boş. */
  actorUserId?: string | null;
}

/** Kaydın ihtiyaç duyduğu iki tablo — `PrismaService` de bir `tx` de olur. */
export type ListingRemovalDb = Pick<
  Prisma.TransactionClient,
  "product" | "productRemovalEvent"
>;

/** Bu yazım bir KALDIRMA mı? (kaldırma statüsüne geçiş, statü değişti) */
export function isListingRemovalTransition(
  entry: Pick<ListingRemovalEntry, "statusBefore" | "statusAfter">,
): boolean {
  return (
    isListingRemovedStatus(entry.statusAfter) &&
    entry.statusBefore !== entry.statusAfter
  );
}

/**
 * Kaldırma nedenini kaydetmenin TEK yolu — satıcı, sistem ve yönetici yolları
 * hep buradan geçer; çağrı yerinde elle `productRemovalEvent` ya da
 * `removalReason` yazılmaz.
 *
 * İki şey yazar:
 * 1. Her kaldırma için EKLEME-YALNIZ bir `ProductRemovalEvent` satırı (dashboard
 *    dönem sayımının kaynağı; yeniden açılıp tekrar kaldırılan ilan iki satır).
 * 2. İlanın güncel nedeni `Product.removalReason` (liste/filtre için kopya).
 *    Yazım yeni statüye koşulludur: bu arada başka bir yazımla vitrine dönmüş
 *    ilana bayat neden yazılmaz.
 *
 * Statü ve `inactiveReason` yazımı ÇAĞIRANINDIR (davranış kuralları orada
 * kalır); bu fonksiyon yalnız NEDENİ kaydeder. Statü yazımıyla aynı
 * transaction'da çağrılmalıdır.
 *
 * @returns kaydedilen kaldırma sayısı
 */
export async function recordListingRemovals(
  db: ListingRemovalDb,
  entries: readonly ListingRemovalEntry[],
): Promise<number> {
  const removals = entries.filter(isListingRemovalTransition);
  if (removals.length === 0) return 0;

  await db.productRemovalEvent.createMany({
    data: removals.map((entry) => ({
      productId: entry.productId,
      reason: entry.reason,
      platform: entry.platform ?? null,
      violationCode: entry.violationCode ?? null,
      detail: entry.detail ?? null,
      statusBefore: entry.statusBefore,
      statusAfter: entry.statusAfter,
      actorUserId: entry.actorUserId ?? null,
    })),
  });

  // (neden, yeni statü) başına tek UPDATE: toplu askıya almada yüzlerce ilan
  // tek yazımla damgalanır.
  const groups = new Map<
    string,
    { reason: ListingRemovalReason; status: ProductStatus; ids: string[] }
  >();
  for (const entry of removals) {
    const key = `${entry.reason}:${entry.statusAfter}`;
    const group = groups.get(key) ?? {
      reason: entry.reason,
      status: entry.statusAfter,
      ids: [],
    };
    group.ids.push(entry.productId);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    await db.product.updateMany({
      where: { id: { in: group.ids }, status: group.status },
      data: { removalReason: group.reason },
    });
  }

  return removals.length;
}

/**
 * Stoktan türetilen statü yazımlarının nedeni. Teslim SONRASI iade karantinası
 * kendi nedenini taşır (`inactiveReason` ile aynı ad); diğer her stok kaynaklı
 * pasife düşüş "stok tükendi"dir.
 */
export function stockStatusRemovalReason(
  inactiveReason: string | null | undefined,
): ListingRemovalReason {
  return inactiveReason === ListingRemovalReason.return_quarantine
    ? ListingRemovalReason.return_quarantine
    : ListingRemovalReason.out_of_stock;
}
