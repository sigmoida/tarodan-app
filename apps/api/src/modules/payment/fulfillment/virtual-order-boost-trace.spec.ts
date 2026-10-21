import { BoostTimelineService } from "../../product/boost-timeline/boost-timeline.service";
import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";

/**
 * Boost activation is traceable in Sentry (`flow=boost`, ids only): the
 * order and its number here, the boost id in the timeline's own breadcrumb.
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

  it("leaves the boost, the order and its number on activation", async () => {
    const { svc, sentry } = make();

    await svc.applyBoostInTx(makeTx(boostRow) as never, payment);

    expect(sentry.setTag).toHaveBeenCalledWith("flow", "boost");
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

  it("marks a repeated activation (already active) without a listing", async () => {
    const { svc, sentry } = make();

    await svc.applyBoostInTx(
      makeTx({ ...boostRow, status: "active" }) as never,
      payment,
    );

    expect(messages(sentry)).toContainEqual(
      expect.objectContaining({
        message: "boost.already_active",
        data: { orderId: "order-1", orderNumber: "BST-K7X9M2QF3N" },
      }),
    );
  });
});
