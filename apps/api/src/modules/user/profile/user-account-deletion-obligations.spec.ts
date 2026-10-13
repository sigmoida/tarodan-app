import {
  OrderStatus,
  PayoutStatus,
  ProductStatus,
  RefundRequestStatus,
  TradeStatus,
} from "@prisma/client";
import { UserProfileService } from "./user-profile.service";

describe("UserProfileService account deletion obligations", () => {
  it("checks every non-terminal commerce and money state before anonymizing", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "user-1" }),
      },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "product-1", status: "reserved" }]),
      },
      trade: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      refundRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentHold: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };
    const service = new UserProfileService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      { recordMarketingChange: jest.fn() } as never, // consents
      { syncUserConsent: jest.fn() } as never, // newsletter
      {} as never, // search
      {} as never, // cache
    );

    await expect(service.deleteAccount("user-1")).rejects.toThrow();

    // S3: yalnız süren satışa/takasa bağlı (rezerve) ilan engeldir.
    expect(prisma.product.findMany.mock.calls[0][0].where.status.in).toEqual([
      ProductStatus.reserved,
    ]);

    const tradeStatuses =
      prisma.trade.findMany.mock.calls[0][0].where.status.in;
    expect(tradeStatuses).toEqual(
      expect.arrayContaining([
        TradeStatus.awaiting_payment,
        TradeStatus.shipping_to_warehouse,
        TradeStatus.at_warehouse,
        TradeStatus.admin_reviewing,
        TradeStatus.shipping_to_recipients,
        TradeStatus.returning,
        TradeStatus.disputed,
      ]),
    );

    const orderStatuses =
      prisma.order.findMany.mock.calls[0][0].where.status.in;
    expect(orderStatuses).toEqual(
      expect.arrayContaining([
        OrderStatus.awaiting_buyer_confirmation,
        OrderStatus.refund_requested,
      ]),
    );

    expect(prisma.refundRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: expect.arrayContaining([
              RefundRequestStatus.pending_review,
              RefundRequestStatus.return_in_transit,
              RefundRequestStatus.disputed,
            ]),
          },
        }),
      }),
    );
    expect(prisma.payoutTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: expect.arrayContaining([
              PayoutStatus.pending,
              PayoutStatus.processing,
              PayoutStatus.retry_pending,
              PayoutStatus.returned,
            ]),
          },
        }),
      }),
    );
    expect(prisma.paymentHold.findMany).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  /**
   * S3 — Apple 5.1.1(v), Play hesap silme: aktif ilan silmeyi engellemez
   * (silme transaction'ında pasife alınır). Rezerve ilan engelin tek ilan
   * türüdür; yanıt sözleşmesi (`errors[]` + `details.activeProducts`) aynen.
   */
  const makeBlockedService = (reserved: number) => {
    const empty = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "user-1" }) },
      product: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: reserved }, (_, i) => ({
            id: `product-${i}`,
            status: ProductStatus.reserved,
          })),
        ),
      },
      trade: empty,
      order: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "order-1", status: OrderStatus.paid }]),
      },
      refundRequest: empty,
      payoutTransfer: empty,
      paymentHold: empty,
      $transaction: jest.fn(),
    };
    const service = new UserProfileService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never, // consents
      {} as never, // newsletter
      {} as never, // search
      {} as never, // cache
    );
    return { service, prisma };
  };

  it("rezerve ilan engeli kendi metniyle döner; details.activeProducts onu sayar", async () => {
    const { service, prisma } = makeBlockedService(2);

    const error = await service
      .deleteAccount("user-1")
      .catch((e: unknown) => e as { getResponse(): any });

    const body = error.getResponse();
    expect(body.i18nKey).toBe("server.user.deleteAccountBlocked");
    expect(body.errors).toEqual(
      expect.arrayContaining([
        {
          i18nKey: "server.user.deleteBlockedReservedListings",
          i18nParams: { count: 2 },
        },
      ]),
    );
    expect(body.details.activeProducts).toBe(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rezerve ilan yoksa ilan engeli yazılmaz (diğer engeller sürer)", async () => {
    const { service } = makeBlockedService(0);

    const error = await service
      .deleteAccount("user-1")
      .catch((e: unknown) => e as { getResponse(): any });

    const body = error.getResponse();
    expect(body.details.activeProducts).toBe(0);
    expect(body.details.pendingOrders).toBe(1);
    expect(
      body.errors.map((entry: { i18nKey: string }) => entry.i18nKey),
    ).toEqual(["server.user.deleteBlockedPendingOrders"]);
  });
});
