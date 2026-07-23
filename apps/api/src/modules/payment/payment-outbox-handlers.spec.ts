import { PaymentOutboxHandlers } from "./payment-outbox-handlers.service";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
} from "../outbox/outbox.types";

const makeDeps = () => {
  const registry = new OutboxHandlerRegistry();
  const paymentCommon = {
    cancelSuratShipmentIfExists: jest.fn().mockResolvedValue(undefined),
  } as any;
  const elogoInvoicing = {
    handleOrderRefund: jest.fn().mockResolvedValue(undefined),
    handleTradeCashRefund: jest.fn().mockResolvedValue(undefined),
  } as any;
  const svc = new PaymentOutboxHandlers(
    registry,
    paymentCommon,
    elogoInvoicing,
  );
  return { registry, paymentCommon, elogoInvoicing, svc };
};

describe("PaymentOutboxHandlers", () => {
  it("shipment.cancel handler'ını kaydeder ve idempotent Sürat iptaline yönlendirir", async () => {
    const { registry, paymentCommon, svc } = makeDeps();
    svc.onModuleInit();
    expect(registry.types()).toContain(OUTBOX_SHIPMENT_CANCEL);

    await registry.get(OUTBOX_SHIPMENT_CANCEL)!(
      { orderId: "o1", orderNumber: "ORD1" },
      {} as any,
    );
    expect(paymentCommon.cancelSuratShipmentIfExists).toHaveBeenCalledWith(
      "o1",
      "ORD1",
    );
  });

  it("orderNumber yoksa orderId'ye düşer", async () => {
    const { registry, paymentCommon, svc } = makeDeps();
    svc.onModuleInit();
    await registry.get(OUTBOX_SHIPMENT_CANCEL)!(
      { orderId: "o2" } as any,
      {} as any,
    );
    expect(paymentCommon.cancelSuratShipmentIfExists).toHaveBeenCalledWith(
      "o2",
      "o2",
    );
  });

  it("invoice.refund_reverse handler'ını kaydeder ve eLogo ters kaydına yönlendirir", async () => {
    const { registry, elogoInvoicing, svc } = makeDeps();
    svc.onModuleInit();
    expect(registry.types()).toContain(OUTBOX_INVOICE_REFUND_REVERSE);

    await registry.get(OUTBOX_INVOICE_REFUND_REVERSE)!(
      { orderId: "o3" },
      {} as any,
    );
    expect(elogoInvoicing.handleOrderRefund).toHaveBeenCalledWith("o3");
  });

  it("invoice.trade_cash_refund_reverse handler'ını kaydeder ve eLogo takas ters kaydına yönlendirir", async () => {
    const { registry, elogoInvoicing, svc } = makeDeps();
    svc.onModuleInit();
    expect(registry.types()).toContain(
      OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
    );

    await registry.get(OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE)!(
      { tradeCashPaymentId: "tcp-9" },
      {} as any,
    );
    expect(elogoInvoicing.handleTradeCashRefund).toHaveBeenCalledWith("tcp-9");
  });
});
