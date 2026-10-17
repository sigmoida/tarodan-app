import { OfferStatus } from "@prisma/client";
import { cancelBuyerOffersForAccountDeletion } from "./account-deletion-offers";
import { OFFER_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";

/**
 * Hesap silme (alıcı tarafı): silinen kullanıcının verdiği bekleyen teklifler
 * kapanır; satıcı anonim alıcıdan gelen teklifi kabul edip açık siparişli
 * silinmiş hesap bırakamaz.
 */
describe("cancelBuyerOffersForAccountDeletion", () => {
  const makeTx = (
    candidates: Array<{ id: string }>,
    cancelled: Array<{ id: string; sellerId: string; productId: string }>,
  ) => ({
    offer: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(candidates)
        .mockResolvedValueOnce(cancelled),
      updateMany: jest.fn().mockResolvedValue({ count: candidates.length }),
    },
  });

  it("alıcının bekleyen ve siparişsiz kabul edilmiş tekliflerini seçer", async () => {
    const tx = makeTx([], []);

    await cancelBuyerOffersForAccountDeletion(tx as never, "buyer-1");

    expect(tx.offer.findMany).toHaveBeenCalledWith({
      where: {
        buyerId: "buyer-1",
        OR: [
          { status: OfferStatus.pending },
          { status: OfferStatus.accepted, order: { is: null } },
        ],
      },
      select: { id: true },
    });
  });

  it("açık teklif yoksa hiçbir şey yazmaz", async () => {
    const tx = makeTx([], []);

    await expect(
      cancelBuyerOffersForAccountDeletion(tx as never, "buyer-1"),
    ).resolves.toEqual([]);
    expect(tx.offer.updateMany).not.toHaveBeenCalled();
  });

  it("teklifleri gerekçeyle kapatır ve satıcıları döner", async () => {
    const closed = [
      { id: "o1", sellerId: "s1", productId: "p1" },
      { id: "o2", sellerId: "s2", productId: "p2" },
    ];
    const tx = makeTx([{ id: "o1" }, { id: "o2" }], closed);

    const result = await cancelBuyerOffersForAccountDeletion(
      tx as never,
      "buyer-1",
    );

    expect(tx.offer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          buyerId: "buyer-1",
          id: { in: ["o1", "o2"] },
        }),
        data: {
          status: OfferStatus.cancelled,
          cancelReason: OFFER_CANCEL_REASON.buyerAccountDeleted,
        },
      }),
    );
    expect(result).toEqual(closed);
  });

  it("yalnız gerçekten kapanan teklifleri döner (yazımdan sonra yeniden okur)", async () => {
    // o2 okuma ile yazım arasında kabul edilip siparişe bağlandı: kapanmadı.
    const tx = makeTx(
      [{ id: "o1" }, { id: "o2" }],
      [{ id: "o1", sellerId: "s1", productId: "p1" }],
    );

    const result = await cancelBuyerOffersForAccountDeletion(
      tx as never,
      "buyer-1",
    );

    expect(result.map((offer) => offer.id)).toEqual(["o1"]);
    expect(tx.offer.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: { in: ["o1", "o2"] },
        status: OfferStatus.cancelled,
        cancelReason: OFFER_CANCEL_REASON.buyerAccountDeleted,
      },
      select: { id: true, sellerId: true, productId: true },
    });
  });
});
