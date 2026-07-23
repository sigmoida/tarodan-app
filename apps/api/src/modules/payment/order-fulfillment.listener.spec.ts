import { OrderFulfillmentListener } from "./order-fulfillment.listener";

describe("OrderFulfillmentListener (Faz 8.1)", () => {
  const makeFinalizer = () => ({ finalizePaidOrder: jest.fn() }) as any;

  it("event'i FulfillmentFinalizer.finalizePaidOrder'a devreder (order/payment/opts aynen)", async () => {
    const finalizer = makeFinalizer();
    const listener = new OrderFulfillmentListener(finalizer);
    const order = { id: "o1" };
    const payment = { id: "p1" };

    await listener.handle({
      order,
      payment,
      skipBuyer: true,
      transactionId: "txn-1",
    });

    expect(finalizer.finalizePaidOrder).toHaveBeenCalledTimes(1);
    expect(finalizer.finalizePaidOrder).toHaveBeenCalledWith(order, payment, {
      skipBuyer: true,
      transactionId: "txn-1",
    });
  });

  it("finalizer hatasını YUTAR (ödeme commit'li — akış bozulmaz)", async () => {
    const finalizer = makeFinalizer();
    finalizer.finalizePaidOrder.mockRejectedValue(new Error("boom"));
    const listener = new OrderFulfillmentListener(finalizer);

    await expect(
      listener.handle({ order: { id: "o1" }, payment: { id: "p1" } }),
    ).resolves.toBeUndefined();
  });
});
