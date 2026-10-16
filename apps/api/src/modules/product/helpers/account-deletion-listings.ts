import {
  ListingRemovalReason,
  OfferStatus,
  Prisma,
  ProductStatus,
} from "@prisma/client";
import { catalogProductWhere } from "./catalog-product-where";
import { recordListingRemovals } from "./listing-removal";
import { OFFER_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";

/**
 * Hesap silmede pasife alınan ilan statüleri (S3 — Apple 5.1.1(v), Play hesap
 * silme politikası). Aktif ilan artık silmeyi ENGELLEMEZ; yayındaki ve onay
 * bekleyen ilanlar silme anında pasife alınır.
 *
 * `reserved` burada YOK: rezerve ilan süren bir satışa ya da takasa bağlıdır
 * ve silmeyi engellemeye devam eder (açık sipariş/takas koruması). Satılmış,
 * pasif, reddedilmiş ve kaldırılmış ilanlar zaten vitrinde değildir.
 */
export const ACCOUNT_DELETION_DEACTIVATED_STATUSES = [
  ProductStatus.active,
  ProductStatus.pending,
] as const;

/** Silmeyi hâlâ engelleyen ilan statüleri — süren satış/takas tutuluşu. */
export const ACCOUNT_DELETION_BLOCKING_LISTING_STATUSES = [
  ProductStatus.reserved,
] as const;

/** Pasife almanın dokunduğu tablolar — silme transaction'ının `tx`'i. */
export type AccountDeletionListingsDb = Pick<
  Prisma.TransactionClient,
  "product" | "productRemovalEvent" | "offer" | "$queryRaw"
>;

/**
 * Satıcının yayındaki ve onay bekleyen ilanlarını pasife alır; hesap silme
 * transaction'ı İÇİNDE çağrılır (anonimleştirme düşerse ilanlar da açık kalır).
 *
 * - Önce satıcının açık (yayında / onayda / rezerve) ilan satırları
 *   `ORDER BY id` + `FOR UPDATE` ile (sabit sırayla — eşzamanlı iki işlem
 *   ters sırada kilitleyip kilitlenmesin) kilitlenir: eşzamanlı checkout/rezervasyon ürün satırını
 *   kilitlediği için ya önce biter (çağıranın işlem içi engel kontrolü onu
 *   görür) ya da bu işlem bitene kadar bekler ve ilanı pasif bulur.
 * - Kayıt, teklif kapatma ve dönen kimlikler GERÇEKTEN pasife alınan
 *   satırlardan gelir (yazımdan sonra yeniden okunur) — okuma ile yazım
 *   arasında rezerve olan bir ilan yanlış "account_deleted" kaydı almaz.
 * - Statü `inactive`; `inactiveReason` yazılmaz (satıcı artık giriş yapamaz,
 *   "yenile / doğrudan aç" işaretinin anlamı yok). Neden `account_deleted`
 *   sistem nedenidir; işlemi başlatan kullanıcı kayda geçer.
 * - Bu ilanlardaki açık teklifler gerekçeyle kapanır (satıcının ilan
 *   kaldırmasıyla aynı gerekçe): bekleyen teklifler ve — savunma olarak —
 *   siparişi hiç açılmamış kabul edilmiş teklifler. Kabulde sipariş
 *   `pending_payment` açıldığından, ödemesi bekleyen kabul edilmiş teklif
 *   açık sipariş engeline takılır (silme geri alınır); siparişi biten
 *   (tamamlanmış/iptal) kabul edilmiş teklif satış geçmişidir, dokunulmaz.
 *
 * Arama dizini, önbellek ve alıcı bildirimleri commit SONRASI çağıranın işidir
 * (tx içindeki yazım henüz görünmez); dönen kimlikler bunun için.
 */
export interface AccountDeletionListingsResult {
  /** Gerçekten pasife alınan ilanlar. */
  productIds: string[];
  /** Kapatılan teklifler — alıcılarına commit sonrası bildirim gider. */
  cancelledOffers: Array<{ id: string; buyerId: string; productId: string }>;
}

export async function deactivateListingsForAccountDeletion(
  tx: AccountDeletionListingsDb,
  sellerId: string,
): Promise<AccountDeletionListingsResult> {
  const nothing: AccountDeletionListingsResult = {
    productIds: [],
    cancelledOffers: [],
  };
  await tx.$queryRaw`
    SELECT id FROM products
    WHERE seller_id = ${sellerId}
      AND kind = 'listing'
      AND status IN ('active', 'pending', 'reserved')
    ORDER BY id
    FOR UPDATE`;

  const listings = await tx.product.findMany({
    where: {
      ...catalogProductWhere(),
      sellerId,
      status: { in: [...ACCOUNT_DELETION_DEACTIVATED_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (listings.length === 0) return nothing;

  const candidateIds = listings.map((listing) => listing.id);
  await tx.product.updateMany({
    where: {
      id: { in: candidateIds },
      status: { in: [...ACCOUNT_DELETION_DEACTIVATED_STATUSES] },
    },
    data: { status: ProductStatus.inactive },
  });
  // Gerçekten pasife alınanlar: kilit altında hepsi olmalı; yine de kayıt ve
  // teklifler yalnız yazımın değiştirdiği satırlara dayanır.
  const deactivated = new Set(
    (
      await tx.product.findMany({
        where: { id: { in: candidateIds }, status: ProductStatus.inactive },
        select: { id: true },
      })
    ).map((row) => row.id),
  );
  const changed = listings.filter((listing) => deactivated.has(listing.id));
  if (changed.length === 0) return nothing;
  const ids = changed.map((listing) => listing.id);

  await recordListingRemovals(
    tx,
    changed.map((listing) => ({
      productId: listing.id,
      statusBefore: listing.status,
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.account_deleted,
      actorUserId: sellerId,
    })),
  );
  const openOfferWhere: Prisma.OfferWhereInput = {
    productId: { in: ids },
    OR: [
      { status: OfferStatus.pending },
      { status: OfferStatus.accepted, order: { is: null } },
    ],
  };
  const cancelledOffers = await tx.offer.findMany({
    where: openOfferWhere,
    select: { id: true, buyerId: true, productId: true },
  });
  if (cancelledOffers.length > 0) {
    await tx.offer.updateMany({
      where: {
        ...openOfferWhere,
        id: { in: cancelledOffers.map((offer) => offer.id) },
      },
      data: {
        status: OfferStatus.cancelled,
        cancelReason: OFFER_CANCEL_REASON.listingDeleted,
      },
    });
  }
  return { productIds: ids, cancelledOffers };
}
