import { PaymentOutboxHandlers } from "./payment-outbox-handlers.service";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
  OUTBOX_ORDER_FULFILLMENT,
} from "../outbox/outbox.types";

const makeDeps = (over?: { order?: any; payment?: any }) => {
  const registry = new OutboxHandlerRegistry();
  const paymentCommon = {
    cancelSuratShipmentIfExists: jest.fn().mockResolvedValue(undefined),
  } as any;
  const elogoInvoicing = {
    handleOrderRefund: jest.fn().mockResolvedValue(undefined),
    handleTradeCashRefund: jest.fn().mockResolvedValue(undefined),
  } as any;
  const prisma = {
    order: {
      findUnique: jest
        .fn()
        .mockResolvedValue("order" in (over ?? {}) ? over!.order : null),
    },
    payment: {
      findFirst: jest
        .fn()
        .mockResolvedValue("payment" in (over ?? {}) ? over!.payment : null),
    },
  } as any;
  const fulfillmentFinalizer = {
    finalizePaidOrder: jest.fn().mockResolvedValue(undefined),
  } as any;
  const svc = new PaymentOutboxHandlers(
    registry,
    paymentCommon,
    elogoInvoicing,
    prisma,
    fulfillmentFinalizer,
  );
  return {
    registry,
    paymentCommon,
    elogoInvoicing,
    prisma,
    fulfillmentFinalizer,
    svc,
  };
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

  describe("#8 order.fulfillment_requested backstop handler", () => {
    it("order+payment TAZE yükler ve finalizePaidOrder'a devreder (opts payload'dan)", async () => {
      const order = { id: "o1", buyer: {}, seller: {}, product: {} };
      const payment = { id: "p1" };
      const { registry, prisma, fulfillmentFinalizer, svc } = makeDeps({
        order,
        payment,
      });
      svc.onModuleInit();
      expect(registry.types()).toContain(OUTBOX_ORDER_FULFILLMENT);

      await registry.get(OUTBOX_ORDER_FULFILLMENT)!(
        { orderId: "o1", skipBuyer: true, transactionId: "txn-9" },
        {} as any,
      );

      // order buyer/seller/product ile yüklenmeli (finalize bunlara erişir)
      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: "o1" },
        include: { buyer: true, seller: true, product: true },
      });
      expect(fulfillmentFinalizer.finalizePaidOrder).toHaveBeenCalledWith(
        order,
        payment,
        { skipBuyer: true, transactionId: "txn-9" },
      );
    });

    it("order yoksa NO-OP (finalize çağrılmaz)", async () => {
      const { registry, fulfillmentFinalizer, svc } = makeDeps({ order: null });
      svc.onModuleInit();

      await registry.get(OUTBOX_ORDER_FULFILLMENT)!(
        { orderId: "gone" },
        {} as any,
      );

      expect(fulfillmentFinalizer.finalizePaidOrder).not.toHaveBeenCalled();
    });

    it("payment yoksa NO-OP (finalize çağrılmaz)", async () => {
      const order = { id: "o1", buyer: {}, seller: {}, product: {} };
      const { registry, fulfillmentFinalizer, svc } = makeDeps({
        order,
        payment: null,
      });
      svc.onModuleInit();

      await registry.get(OUTBOX_ORDER_FULFILLMENT)!(
        { orderId: "o1" },
        {} as any,
      );

      expect(fulfillmentFinalizer.finalizePaidOrder).not.toHaveBeenCalled();
    });
  });
});
