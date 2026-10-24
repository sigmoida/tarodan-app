import {
  BOOST_SENTRY_TAG,
  boostBreadcrumb,
  tagBoostRequest,
} from "./boost-observability";

describe("boost observability", () => {
  const sentry = () => ({ setTag: jest.fn(), addBreadcrumb: jest.fn() });

  it("tags a request flow=boost", () => {
    const s = sentry();

    tagBoostRequest(s);

    expect(s.setTag).toHaveBeenCalledWith("flow", "boost");
    expect(BOOST_SENTRY_TAG).toEqual({ key: "flow", value: "boost" });
  });

  it("leaves a breadcrumb with the known ids only, and sets no tag", () => {
    const s = sentry();

    boostBreadcrumb(s, "order_created", {
      boostId: "b1",
      orderId: "order-1",
      orderNumber: "BST-K7X9M2QF3N",
      productId: null,
    });

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
    expect(s.setTag).not.toHaveBeenCalled();
  });

  it("is a no-op without Sentry", () => {
    expect(() => {
      tagBoostRequest(undefined);
      boostBreadcrumb(undefined, "x", { boostId: "b1" });
    }).not.toThrow();
  });
});
