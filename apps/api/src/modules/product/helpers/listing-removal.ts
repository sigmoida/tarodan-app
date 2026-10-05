import {
  ListingRemovalReason,
  Prisma,
  ProductInactiveReason,
  ProductStatus,
} from "@prisma/client";
import {
  LISTING_REMOVAL_REASONS_BY_ACTOR,
  isLateSoldElsewhere,
  isListingRemovedStatus,
  listingRemovalActorOf,
  wasOnStorefront,
} from "@tarodan/types";

/**
 * Bir ilanın vitrinden düşüşü — kim, hangi nedenle, hangi statüden hangisine.
 *
 * `statusBefore`/`statusAfter` çağıranın OKUDUĞU ve YAZDIĞI statülerdir; geçiş
 * gerçekten bir kaldırma değilse (yeni statü kaldırma statüsü değil ya da
 * statü ve davranış işareti değişmedi) kayıt düşülmez — çağıran stoktan
 * türetilen statü gibi "kaldırma olabilir de olmayabilir de" bir yazımdan
 * sonra koşulsuz çağırabilir.
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
  /**
   * `inactiveReason` (davranış işareti) yazan çağıranlar okuduğu ve yazdığı
   * değeri verir. Statü değişmese de işaret değiştiyse (ör. duraklatılmış ya
   * da süresi dolmuş ilan iade karantinasına girdi) bu bir yeniden
   * sınıflandırmadır: kaydedilir ve güncel neden onu izler. Verilmezse
   * (`undefined`) yalnız statü değişimi bakılır.
   */
  inactiveReasonBefore?: ProductInactiveReason | null;
  inactiveReasonAfter?: ProductInactiveReason | null;
}

/** Kaydın ihtiyaç duyduğu iki tablo — `PrismaService` de bir `tx` de olur. */
export type ListingRemovalDb = Pick<
  Prisma.TransactionClient,
  "product" | "productRemovalEvent"
>;

/**
 * Geç gelen "başka platformda sattım" cevabı mı (bkz. @tarodan/types
 * `isLateSoldElsewhere`)? Yalnız vitrin dışından gelen `sold_elsewhere`
 * kayıtları için ilanın önceki olaylarını okur; diğer her kayıt sorgusuzdur.
 */
async function lateSoldElsewhereOf(
  db: ListingRemovalDb,
  entry: {
    productId: string;
    reason: ListingRemovalReason;
    fromStorefront: boolean;
  },
): Promise<boolean> {
  if (
    entry.reason !== ListingRemovalReason.sold_elsewhere ||
    entry.fromStorefront
  ) {
    return false;
  }
  const history = await db.productRemovalEvent.findMany({
    where: {
      productId: entry.productId,
      OR: [
        { reason: ListingRemovalReason.sold_elsewhere },
        { fromStorefront: true },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { reason: true, fromStorefront: true },
  });
  return isLateSoldElsewhere({ ...entry, history });
}

/** Çağıran davranış işaretini bu yazımda DEĞİŞTİRDİ mi? */
function inactiveReasonChanged(
  entry: Pick<
    ListingRemovalEntry,
    "inactiveReasonBefore" | "inactiveReasonAfter"
  >,
): boolean {
  return (
    entry.inactiveReasonAfter !== undefined &&
    (entry.inactiveReasonAfter ?? null) !== (entry.inactiveReasonBefore ?? null)
  );
}

/**
 * Bu yazım kaydedilecek bir kaldırma mı? Yeni statü bir kaldırma statüsü
 * olmalı ve ya statü değişmiş ya da (aynı kaldırma statüsünde kalınırken)
 * davranış işareti değişmiş olmalı. Aynı statünün aynı işaretle yeniden
 * yazımı (stok yeniden hesabı vb.) kayıt üretmez.
 */
export function isListingRemovalTransition(
  entry: Pick<
    ListingRemovalEntry,
    | "statusBefore"
    | "statusAfter"
    | "inactiveReasonBefore"
    | "inactiveReasonAfter"
  >,
): boolean {
  return (
    isListingRemovedStatus(entry.statusAfter) &&
    (entry.statusBefore !== entry.statusAfter || inactiveReasonChanged(entry))
  );
}

/** Vitrin dışındaki ilanda satıcı nedeninin ezebileceği güncel nedenler. */
const SELLER_REASONS = [
  ...LISTING_REMOVAL_REASONS_BY_ACTOR.seller,
] as ListingRemovalReason[];

/**
 * Güncel nedenin yazım koşulu — @tarodan/types `replacesCurrentRemovalReason`
 * kuralının küme biçimi (tek satırı okumadan, tek UPDATE'te uygulanabilsin
 * diye). Vitrinden düşüş ve yönetici/sistem nedeni koşulsuz yazar; vitrin
 * dışındaki ilanda satıcı nedeni yalnız güncel neden boş ya da yine bir satıcı
 * nedeniyse yazar (reddedilmiş ilanı pasife almak "kural ihlali"ni ezmez).
 * Spec ikisinin aynı kararı verdiğini sabitler.
 */
export function currentReasonGuard(change: {
  fromStorefront: boolean;
  reason: ListingRemovalReason;
}): Prisma.ProductWhereInput {
  if (change.fromStorefront) return {};
  if (listingRemovalActorOf(change.reason) !== "seller") return {};
  return {
    OR: [{ removalReason: null }, { removalReason: { in: SELLER_REASONS } }],
  };
}

/**
 * Kaldırma nedenini kaydetmenin TEK yolu — satıcı, sistem ve yönetici yolları
 * hep buradan geçer; çağrı yerinde elle `productRemovalEvent` ya da
 * `removalReason` yazılmaz.
 *
 * İki şey yazar:
 * 1. Her kaldırma için EKLEME-YALNIZ bir `ProductRemovalEvent` satırı.
 *    `fromStorefront` kayıt anında yazılır (önceki statü vitrin miydi —
 *    `wasOnStorefront`): dashboard yalnız bunları "vitrinden düşüş" sayar;
 *    vitrin dışındaki ilanın sonraki kaldırmaları geçmişte kalır, sayılmaz.
 *    `lateSoldElsewhere` da kayıt anında yazılır: zaten vitrinden düşmüş
 *    ilanın ilk "başka platformda sattım" cevabı toplam sayıma girmez ama
 *    dashboard'ın platform kırılımına girer (`isLateSoldElsewhere`).
 * 2. İlanın güncel nedeni `Product.removalReason` (liste/filtre için kopya).
 *    Yazım yeni statüye koşulludur (bu arada vitrine dönmüş ilana bayat neden
 *    yazılmaz) ve vitrin dışındaki ilanda satıcı nedeni yönetici/sistem
 *    nedenini ezmez (bkz. {@link currentReasonGuard}).
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
  const transitions = entries
    .filter(isListingRemovalTransition)
    .map((entry) => ({
      ...entry,
      fromStorefront: wasOnStorefront(entry.statusBefore),
    }));
  if (transitions.length === 0) return 0;
  const removals = await Promise.all(
    transitions.map(async (entry) => ({
      ...entry,
      lateSoldElsewhere: await lateSoldElsewhereOf(db, entry),
    })),
  );

  await db.productRemovalEvent.createMany({
    data: removals.map((entry) => ({
      productId: entry.productId,
      reason: entry.reason,
      platform: entry.platform ?? null,
      violationCode: entry.violationCode ?? null,
      detail: entry.detail ?? null,
      statusBefore: entry.statusBefore,
      statusAfter: entry.statusAfter,
      fromStorefront: entry.fromStorefront,
      // Yalnız true iken yazılır (kolon varsayılanı false): olağan kayıt
      // şekli değişmez.
      ...(entry.lateSoldElsewhere ? { lateSoldElsewhere: true } : {}),
      actorUserId: entry.actorUserId ?? null,
    })),
  });

  // (neden, yeni statü, vitrinden mi) başına tek UPDATE: toplu askıya almada
  // yüzlerce ilan tek yazımla damgalanır.
  const groups = new Map<
    string,
    {
      reason: ListingRemovalReason;
      status: ProductStatus;
      fromStorefront: boolean;
      ids: string[];
    }
  >();
  for (const entry of removals) {
    const key = `${entry.reason}:${entry.statusAfter}:${entry.fromStorefront}`;
    const group = groups.get(key) ?? {
      reason: entry.reason,
      status: entry.statusAfter,
      fromStorefront: entry.fromStorefront,
      ids: [],
    };
    group.ids.push(entry.productId);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    await db.product.updateMany({
      where: {
        id: { in: group.ids },
        status: group.status,
        ...currentReasonGuard(group),
      },
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
