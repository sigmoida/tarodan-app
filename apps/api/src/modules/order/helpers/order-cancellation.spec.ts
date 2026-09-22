import { CancellationActor, OrderStatus } from "@prisma/client";
import { unstampedTransitions } from "../../../common/helpers/stamped-transition.guard";
import { orderCancelledData } from "./order-cancellation";

describe("orderCancelledData", () => {
  it("stamps the cancellation moment and the actor alongside the status", () => {
    const at = new Date("2026-04-01T10:00:00.000Z");
    expect(orderCancelledData(CancellationActor.seller, at)).toEqual({
      status: OrderStatus.cancelled,
      cancelledAt: at,
      cancelledBy: CancellationActor.seller,
    });
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    const { cancelledAt } = orderCancelledData(CancellationActor.system);
    expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it.each(Object.values(CancellationActor))(
    "writes actor %s as given",
    (by) => {
      expect(orderCancelledData(by).cancelledBy).toBe(by);
    },
  );

  /**
   * The metric "iptal edilen sipariş" is only as honest as the least careful
   * cancel path. A new path that writes `status: cancelled` straight into an
   * `order.update` would silently drop out of every period — and out of the
   * İptal & İade screen's actor tabs — so the rule is enforced over the
   * source, not trusted to review. The helper's required actor parameter then
   * makes the compiler ask every such path who cancelled.
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
