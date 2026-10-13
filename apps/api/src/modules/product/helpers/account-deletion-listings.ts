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
  "product" | "productRemovalEvent" | "offer"
>;

/**
 * Satıcının yayındaki ve onay bekleyen ilanlarını pasife alır; hesap silme
 * transaction'ı İÇİNDE çağrılır (anonimleştirme düşerse ilanlar da açık kalır).
 *
 * - Statü `inactive`; `inactiveReason` yazılmaz (satıcı artık giriş yapamaz,
 *   "yenile / doğrudan aç" işaretinin anlamı yok). Neden `account_deleted`
 *   sistem nedenidir; işlemi başlatan kullanıcı kayda geçer.
 * - Bu ilanlardaki AÇIK teklifler gerekçeyle kapanır: alıcı süre dolana dek
 *   "yanıt bekliyor" görmesin (satıcının ilan kaldırmasıyla aynı gerekçe).
 *
 * Arama dizini ve önbellek commit SONRASI çağıranın işidir (tx içindeki yazım
 * henüz görünmez); dönen kimlikler bunun için.
 *
 * @returns pasife alınan ilanların kimlikleri
 */
export async function deactivateListingsForAccountDeletion(
  tx: AccountDeletionListingsDb,
  sellerId: string,
): Promise<string[]> {
  const listings = await tx.product.findMany({
    where: {
      ...catalogProductWhere(),
      sellerId,
      status: { in: [...ACCOUNT_DELETION_DEACTIVATED_STATUSES] },
    },
    select: { id: true, status: true },
  });
  if (listings.length === 0) return [];

  const ids = listings.map((listing) => listing.id);
  // Statü filtresi tekrarlanır: okuma ile yazım arasında satışa giren
  // (rezerve olan) ilanın statüsü pasife ezilmez.
  await tx.product.updateMany({
    where: {
      id: { in: ids },
      status: { in: [...ACCOUNT_DELETION_DEACTIVATED_STATUSES] },
    },
    data: { status: ProductStatus.inactive },
  });
  await recordListingRemovals(
    tx,
    listings.map((listing) => ({
      productId: listing.id,
      statusBefore: listing.status,
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.account_deleted,
      actorUserId: sellerId,
    })),
  );
  await tx.offer.updateMany({
    where: { productId: { in: ids }, status: OfferStatus.pending },
    data: {
      status: OfferStatus.cancelled,
      cancelReason: OFFER_CANCEL_REASON.listingDeleted,
    },
  });
  return ids;
}
