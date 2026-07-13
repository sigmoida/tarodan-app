import { PaymentStatus } from "@prisma/client";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";

/**
 * #71 — processFailedPayment must only flip a still-pending payment to `failed`.
 * A replayed or late `failed` callback on an already-`completed` payment is a
 * no-op: the payment is not flipped and no downstream cancellation runs.
 */
describe("PaymentFulfillmentService.processFailedPayment — idempotent guard", () => {
  // Any dependency other than prisma just needs to be call-safe.
  const anyDep = () =>
    new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) }) as any;

  function makeService(flipCount: number) {
    const prisma = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: flipCount }),
        update: jest.fn().mockResolvedValue({}),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const svc = new PaymentFulfillmentService(
      prisma,
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
      anyDep(),
    );
    return { svc, prisma };
  }

  it("already-completed payment (flip count 0) is a no-op — early return, no cancellation", async () => {
    const { svc, prisma } = makeService(0);

    await svc.processFailedPayment(
      {
        id: "pay-1",
        status: PaymentStatus.completed,
        checkoutGroupId: "grp-1",
      },
      "late failed callback",
    );

    // The flip is a conditional claim scoped to still-pending payments.
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: PaymentStatus.pending },
      data: {
        status: PaymentStatus.failed,
        failureReason: "late failed callback",
      },
    });
    // Count 0 → returned before any downstream order processing.
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    // And the unconditional update() path is gone.
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("still-pending payment (flip count 1) proceeds into failure handling", async () => {
    const { svc, prisma } = makeService(1);

    await svc.processFailedPayment(
      { id: "pay-2", status: PaymentStatus.pending, checkoutGroupId: "grp-2" },
      "card declined",
    );

    expect(prisma.payment.updateMany).toHaveBeenCalled();
    // Proceeded past the guard into the group-cancellation branch.
    expect(prisma.order.findMany).toHaveBeenCalled();
  });
});
