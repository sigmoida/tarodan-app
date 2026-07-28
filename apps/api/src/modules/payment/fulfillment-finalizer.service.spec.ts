import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";
import { LedgerEventType, OrderStatus } from "@prisma/client";

/**
 * #8: finalize iki kez koşabilir (anlık yol + outbox backstop / drainer retry).
 * ledger.record idempotent DEĞİL (her çağrı yeni entryGroup) → finalize, çift capture'ı
 * `payment_captured` var-mı existence-guard'ıyla önlemeli. Bu spec o korumayı sabitler.
 */
describe("FulfillmentFinalizer — ledger capture idempotency (#8)", () => {
  const order = {
    id: "o1",
    orderNumber: "ORD-1",
    buyerId: "b1",
    sellerId: "s1",
    productId: "prod-1",
    totalAmount: 100,
    commissionAmount: 10,
    withholdingTaxAmount: 2,
    buyer: { email: "buyer@x.com", displayName: "Buyer" },
    seller: { email: "seller@x.com", displayName: "Seller" },
    product: { title: "Ürün" },
    shippingAddress: {},
  };
  const payment = { id: "p1", provider: "paytr", providerPaymentId: "txn-1" };

  const make = (existingCapture: boolean) => {
    const prisma = {
      ledgerEntry: {
        findFirst: jest
          .fn()
          .mockResolvedValue(existingCapture ? { id: "le-1" } : null),
      },
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: OrderStatus.preparing }),
      },
    } as any;
    const eventService = {
      emitOrderPaid: jest.fn().mockResolvedValue(undefined),
    } as any;
    const paymentCommon = {
      ensureSuratShipmentForOrder: jest.fn().mockResolvedValue("created"),
    } as any;
    const ledger = {
      recordCapture: jest.fn().mockResolvedValue("grp-1"),
    } as any;
    const svc = new FulfillmentFinalizer(
      prisma,
      eventService,
      paymentCommon,
      ledger,
    );
    return { svc, prisma, eventService, paymentCommon, ledger };
  };

  it("capture YOKSA: existence-check yapar, recordCapture'ı doğru tutarlarla çağırır", async () => {
    const { svc, prisma, ledger } = make(false);

    await svc.finalizePaidOrder(order, payment, { transactionId: "txn-1" });

    expect(prisma.ledgerEntry.findFirst).toHaveBeenCalledWith({
      where: { orderId: "o1", eventType: LedgerEventType.payment_captured },
      select: { id: true },
    });
    expect(ledger.recordCapture).toHaveBeenCalledTimes(1);
    const arg = ledger.recordCapture.mock.calls[0][1];
    expect(arg).toMatchObject({
      paymentId: "p1",
      orderId: "o1",
      gross: 100,
      commission: 10,
      withholdingTax: 2,
      sellerNet: 88, // 100 - 10 - 2
    });
  });

  it("capture VARSA: recordCapture ATLANIR (çift ledger yok) — order.paid+kargo yine koşar", async () => {
    const { svc, ledger, eventService, paymentCommon } = make(true);

    await svc.finalizePaidOrder(order, payment, {});

    expect(ledger.recordCapture).not.toHaveBeenCalled();
    // 2. ve 3. adımlar (order.paid + kargo) kendi idempotency'leriyle yine çalışır
    expect(eventService.emitOrderPaid).toHaveBeenCalledTimes(1);
    expect(paymentCommon.ensureSuratShipmentForOrder).toHaveBeenCalledWith(
      "o1",
    );
  });

  it("iptal edilmiş siparişte bildirim ve kargo yan etkilerini çalıştırmaz", async () => {
    const { svc, prisma, eventService, paymentCommon } = make(false);
    prisma.order.findUnique.mockResolvedValue({
      status: OrderStatus.cancelled,
    });

    await svc.finalizePaidOrder(order, payment, {});

    expect(eventService.emitOrderPaid).not.toHaveBeenCalled();
    expect(paymentCommon.ensureSuratShipmentForOrder).not.toHaveBeenCalled();
  });
});
