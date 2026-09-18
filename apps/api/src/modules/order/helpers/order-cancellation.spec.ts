import { OrderStatus } from "@prisma/client";
import { unstampedTransitions } from "../../../common/helpers/stamped-transition.guard";
import { orderCancelledData } from "./order-cancellation";

describe("orderCancelledData", () => {
  it("stamps the cancellation moment alongside the status", () => {
    const at = new Date("2026-04-01T10:00:00.000Z");
    expect(orderCancelledData(at)).toEqual({
      status: OrderStatus.cancelled,
      cancelledAt: at,
    });
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    const { cancelledAt } = orderCancelledData();
    expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  /**
   * The metric "iptal edilen sipariş" is only as honest as the least careful
   * cancel path. A new path that writes `status: cancelled` straight into an
   * `order.update` would silently drop out of every period — so the rule is
   * enforced over the source, not trusted to review.
   */
  it("is the ONLY way an order is written to cancelled", () => {
    // Only the `order` delegate is in scope — shipments, offers, trades,
    // boosts and e-invoices have their own `cancelled` state.
    expect(
      unstampedTransitions({
        delegate: "order",
        statuses: ["cancelled"],
        enumName: "OrderStatus",
        helpers: ["orderCancelledData"],
      }),
    ).toEqual([]);
  });
});
