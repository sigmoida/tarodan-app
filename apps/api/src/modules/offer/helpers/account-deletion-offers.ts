import { OfferStatus, Prisma } from "@prisma/client";
import { OFFER_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";

/** Alıcı teklifleri kapatmanın dokunduğu tablo — silme transaction'ının `tx`'i. */
export type AccountDeletionOffersDb = Pick<Prisma.TransactionClient, "offer">;

/** Kapatılan teklif — satıcısına commit sonrası bildirim gider. */
export interface CancelledBuyerOffer {
  id: string;
  sellerId: string;
  productId: string;
}

/**
 * Silinen hesabın ALICI olarak verdiği açık teklifleri kapatır (hesap silme
 * transaction'ı İÇİNDE çağrılır). Satıcı tarafı ayrıdır
 * (`deactivateListingsForAccountDeletion`: kendi ilanlarındaki teklifler);
 * bu olmadan satıcı, anonimleşmiş alıcıdan gelen teklifi kabul edip açık
 * siparişli silinmiş hesap bırakabilirdi.
 *
 * Açık = bekleyen teklifler (satıcının karşı teklifiyle alıcıya dönenler
 * dahil) ve — savunma olarak — siparişi hiç açılmamış kabul edilmişler.
 * Siparişi açılmış kabul edilmiş teklif açık sipariş engeline takılır
 * (silme geri alınır); dönen kimlikler yazımdan sonra yeniden okunur, yani
 * yalnız GERÇEKTEN kapanan teklifler bildirilir.
 */
export async function cancelBuyerOffersForAccountDeletion(
  tx: AccountDeletionOffersDb,
  buyerId: string,
): Promise<CancelledBuyerOffer[]> {
  const openOfferWhere: Prisma.OfferWhereInput = {
    buyerId,
    OR: [
      { status: OfferStatus.pending },
      { status: OfferStatus.accepted, order: { is: null } },
    ],
  };
  const candidates = await tx.offer.findMany({
    where: openOfferWhere,
    select: { id: true },
  });
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((offer) => offer.id);
  await tx.offer.updateMany({
    where: { ...openOfferWhere, id: { in: candidateIds } },
    data: {
      status: OfferStatus.cancelled,
      cancelReason: OFFER_CANCEL_REASON.buyerAccountDeleted,
    },
  });
  return tx.offer.findMany({
    where: {
      id: { in: candidateIds },
      status: OfferStatus.cancelled,
      cancelReason: OFFER_CANCEL_REASON.buyerAccountDeleted,
    },
    select: { id: true, sellerId: true, productId: true },
  });
}
