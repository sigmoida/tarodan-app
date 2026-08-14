import { OrderFulfillmentListener } from "./order-fulfillment.listener";
import { OutboxStatus } from "@prisma/client";
import { OUTBOX_ORDER_FULFILLMENT } from "../../outbox/outbox.types";

describe("OrderFulfillmentListener (Faz 8.1 + #8 backstop)", () => {
  const makeFinalizer = () => ({ finalizePaidOrder: jest.fn() }) as any;
  const makePrisma = () =>
    ({
      outboxEvent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }) as any;

  it("event'i FulfillmentFinalizer.finalizePaidOrder'a devreder (order/payment/opts aynen)", async () => {
    const finalizer = makeFinalizer();
    const prisma = makePrisma();
    const listener = new OrderFulfillmentListener(finalizer, prisma);
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

  it("#8: anlık yol BAŞARIRSA outbox backstop satırını `completed` işaretler (yalnız pending)", async () => {
    const finalizer = makeFinalizer();
    const prisma = makePrisma();
    const listener = new OrderFulfillmentListener(finalizer, prisma);

    await listener.handle({ order: { id: "o1" }, payment: { id: "p1" } });

    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        dedupeKey: `${OUTBOX_ORDER_FULFILLMENT}:o1`,
        status: OutboxStatus.pending,
      },
      data: { status: OutboxStatus.completed, processedAt: expect.any(Date) },
    });
  });

  it("#8: finalize HATA verirse backstop satırı BASTIRILMAZ (drainer retry etsin)", async () => {
    const finalizer = makeFinalizer();
    finalizer.finalizePaidOrder.mockRejectedValue(new Error("boom"));
    const prisma = makePrisma();
    const listener = new OrderFulfillmentListener(finalizer, prisma);

    await expect(
      listener.handle({ order: { id: "o1" }, payment: { id: "p1" } }),
    ).resolves.toBeUndefined();

    // finalize atomikliği: hata → outbox satırı `pending` kalmalı (suppress ÇAĞRILMAZ)
    expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it("finalizer hatasını YUTAR (ödeme commit'li — akış bozulmaz)", async () => {
    const finalizer = makeFinalizer();
    finalizer.finalizePaidOrder.mockRejectedValue(new Error("boom"));
    const prisma = makePrisma();
    const listener = new OrderFulfillmentListener(finalizer, prisma);

    await expect(
      listener.handle({ order: { id: "o1" }, payment: { id: "p1" } }),
    ).resolves.toBeUndefined();
  });
});
