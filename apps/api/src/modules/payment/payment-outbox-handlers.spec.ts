import { PaymentOutboxHandlers } from "./payment-outbox-handlers.service";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import { OUTBOX_SHIPMENT_CANCEL } from "../outbox/outbox.types";

describe("PaymentOutboxHandlers", () => {
  it("shipment.cancel handler'ını kaydeder ve idempotent Sürat iptaline yönlendirir", async () => {
    const registry = new OutboxHandlerRegistry();
    const paymentCommon = {
      cancelSuratShipmentIfExists: jest.fn().mockResolvedValue(undefined),
    } as any;
    const svc = new PaymentOutboxHandlers(registry, paymentCommon);

    svc.onModuleInit();
    expect(registry.types()).toContain(OUTBOX_SHIPMENT_CANCEL);

    const handler = registry.get(OUTBOX_SHIPMENT_CANCEL)!;
    await handler({ orderId: "o1", orderNumber: "ORD1" }, {} as any);

    expect(paymentCommon.cancelSuratShipmentIfExists).toHaveBeenCalledWith(
      "o1",
      "ORD1",
    );
  });

  it("orderNumber yoksa orderId'ye düşer", async () => {
    const registry = new OutboxHandlerRegistry();
    const paymentCommon = {
      cancelSuratShipmentIfExists: jest.fn().mockResolvedValue(undefined),
    } as any;
    new PaymentOutboxHandlers(registry, paymentCommon).onModuleInit();

    await registry.get(OUTBOX_SHIPMENT_CANCEL)!(
      { orderId: "o2" } as any,
      {} as any,
    );
    expect(paymentCommon.cancelSuratShipmentIfExists).toHaveBeenCalledWith(
      "o2",
      "o2",
    );
  });
});
