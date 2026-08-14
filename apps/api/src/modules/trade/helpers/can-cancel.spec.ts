import { TradeStatus } from "@prisma/client";
import { computeTradeCanCancel } from "../trade.service";

const baseTrade = {
  initiatorId: "initiator-id",
  receiverId: "receiver-id",
  firstWarehouseArrivalAt: null as Date | null,
};

describe("computeTradeCanCancel", () => {
  it("returns false when no viewer is supplied", () => {
    expect(
      computeTradeCanCancel(
        { ...baseTrade, status: TradeStatus.pending },
        null,
      ),
    ).toBe(false);
  });

  it("returns false when the viewer is not a participant", () => {
    expect(
      computeTradeCanCancel(
        { ...baseTrade, status: TradeStatus.pending },
        "stranger-id",
      ),
    ).toBe(false);
  });

  it.each([
    TradeStatus.pending,
    TradeStatus.accepted,
    TradeStatus.awaiting_payment,
    TradeStatus.shipping_to_warehouse,
  ])("allows participant cancel in eligible state %s", (status) => {
    expect(
      computeTradeCanCancel({ ...baseTrade, status }, baseTrade.initiatorId),
    ).toBe(true);
    expect(
      computeTradeCanCancel({ ...baseTrade, status }, baseTrade.receiverId),
    ).toBe(true);
  });

  it("locks cancel once an item has arrived at the warehouse", () => {
    expect(
      computeTradeCanCancel(
        {
          ...baseTrade,
          status: TradeStatus.shipping_to_warehouse,
          firstWarehouseArrivalAt: new Date(),
        },
        baseTrade.initiatorId,
      ),
    ).toBe(false);
  });

  it.each([
    TradeStatus.at_warehouse,
    TradeStatus.admin_reviewing,
    TradeStatus.shipping_to_recipients,
    TradeStatus.returning,
    TradeStatus.disputed,
    TradeStatus.completed,
    TradeStatus.cancelled,
    TradeStatus.rejected,
  ])("blocks cancel in non-eligible state %s", (status) => {
    expect(
      computeTradeCanCancel({ ...baseTrade, status }, baseTrade.initiatorId),
    ).toBe(false);
  });
});
