import { BoostTimelineService } from "../../product/boost-timeline/boost-timeline.service";
import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";

/**
 * Boost activation is traceable in Sentry with ids only: the order and its
 * number here, the boost id in the timeline's own breadcrumb. Breadcrumbs,
 * no tag: this also runs in worker jobs, which share the process scope. A
 * paid boost order without its boost is an error event.
 */
describe("VirtualOrderFulfillmentService.applyBoostInTx — Sentry trail", () => {
  const makeTx = (boost: Record<string, unknown> | null) => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    productBoost: {
      findUnique: jest.fn().mockResolvedValue(boost),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue({ boostedUntil: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    order: { update: jest.fn().mockResolvedValue({}) },
  });

  const boostRow = {
    id: "b1",
    productId: "listing-1",
    orderId: "order-1",
    durationDays: 7,
    showcaseOnHome: false,
    status: "pending",
  };

  const make = () => {
    const sentry = {
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
      captureMessage: jest.fn(),
    };
    const svc = new VirtualOrderFulfillmentService(
      {} as never,
      {} as never,
      new BoostTimelineService(sentry as never),
      undefined,
      undefined,
      sentry as never,
    );
    return { svc, sentry };
  };

  const payment = {
    id: "pay-1",
    orderId: "order-1",
    order: { orderNumber: "BST-K7X9M2QF3N" },
  };

  const messages = (sentry: { addBreadcrumb: jest.Mock }) =>
    sentry.addBreadcrumb.mock.calls.map(
      ([crumb]: [{ message: string; data: unknown }]) => crumb,
    );

  it("leaves the boost, the order and its number on activation, without a tag", async () => {
    const { svc, sentry } = make();

    await svc.applyBoostInTx(makeTx(boostRow) as never, payment);

    expect(sentry.setTag).not.toHaveBeenCalled();
    expect(messages(sentry)).toEqual([
      expect.objectContaining({
        message: "boost.activate",
        data: { boostId: "b1", productId: "listing-1" },
      }),
      expect.objectContaining({
        message: "boost.activated",
        data: {
          orderId: "order-1",
          orderNumber: "BST-K7X9M2QF3N",
          productId: "listing-1",
        },
      }),
    ]);
  });

  it("marks a skipped activation (the boost already ran) without a listing", async () => {
    const { svc, sentry } = make();

    await svc.applyBoostInTx(
      makeTx({ ...boostRow, status: "active" }) as never,
      payment,
    );

    expect(messages(sentry)).toContainEqual(
      expect.objectContaining({
        message: "boost.activation_skipped",
        data: { orderId: "order-1", orderNumber: "BST-K7X9M2QF3N" },
      }),
    );
  });

  it("reports a paid boost order without its boost as an error event", async () => {
    const { svc, sentry } = make();

    const productId = await svc.applyBoostInTx(makeTx(null) as never, payment);

    expect(productId).toBeNull();
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "Boost order order-1 paid by payment pay-1 has no ProductBoost",
      "error",
    );
  });
});
