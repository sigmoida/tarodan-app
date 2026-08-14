import { OfferStatus, OrderStatus } from "@prisma/client";
import { ProductLockService } from "./product-lock.service";

/**
 * Regression: a stockout sweep must not cancel offers that already became a
 * paid sale. An accepted offer keeps status `accepted` after payment; only the
 * linked Order advances to `paid`. invalidateRelatedOffers must therefore skip
 * accepted offers whose order has moved past pending_payment — otherwise the
 * buyer who drained the last unit sees their PAID offer flipped to "İptal
 * Edildi" together with the genuinely unpaid one.
 */
describe("ProductLockService.invalidateRelatedOffers paid-offer guard", () => {
  const productId = "prod-1";

  function buildService() {
    const tx = {
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new ProductLockService({} as any, {} as any);
    return { service, tx };
  }

  it("only targets pending/accepted offers with no order or an unpaid/cancelled order", async () => {
    const { service, tx } = buildService();

    await service.invalidateRelatedOffers(tx as any, productId);

    expect(tx.offer.findMany).toHaveBeenCalledTimes(1);
    const where = tx.offer.findMany.mock.calls[0][0].where;

    expect(where.status).toEqual({
      in: [OfferStatus.pending, OfferStatus.accepted],
    });
    // The guard: skip offers tied to a paid (or further) order.
    expect(where.OR).toEqual([
      { order: { is: null } },
      {
        order: {
          status: { in: [OrderStatus.pending_payment, OrderStatus.cancelled] },
        },
      },
    ]);
  });

  it("preserves excludeOfferId alongside the paid-order guard", async () => {
    const { service, tx } = buildService();

    await service.invalidateRelatedOffers(tx as any, productId, "keep-me");

    const where = tx.offer.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "keep-me" });
    expect(where.OR).toBeDefined();
  });
});
