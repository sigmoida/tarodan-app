import { BOOST_SENTRY_TAG, traceBoost } from "./boost-observability";

describe("traceBoost", () => {
  const sentry = () => ({ setTag: jest.fn(), addBreadcrumb: jest.fn() });

  it("tags the scope flow=boost and leaves a breadcrumb with the known ids", () => {
    const s = sentry();

    traceBoost(s, "order_created", {
      boostId: "b1",
      orderId: "order-1",
      orderNumber: "BST-K7X9M2QF3N",
      productId: null,
    });

    expect(s.setTag).toHaveBeenCalledWith("flow", "boost");
    expect(BOOST_SENTRY_TAG).toEqual({ key: "flow", value: "boost" });
    expect(s.addBreadcrumb).toHaveBeenCalledWith({
      category: "boost",
      message: "boost.order_created",
      level: "info",
      // Unknown ids are left out, not sent as null.
      data: {
        boostId: "b1",
        orderId: "order-1",
        orderNumber: "BST-K7X9M2QF3N",
      },
    });
  });

  it("is a no-op without Sentry", () => {
    expect(() => traceBoost(undefined, "x", { boostId: "b1" })).not.toThrow();
  });
});
