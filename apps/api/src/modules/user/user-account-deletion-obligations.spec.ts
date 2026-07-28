import {
  OrderStatus,
  PayoutStatus,
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
          .mockResolvedValue([{ id: "product-1", status: "active" }]),
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
    const service = new UserProfileService(prisma as any, {} as any, {} as any);

    await expect(service.deleteAccount("user-1")).rejects.toThrow();

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
});
