import { CancellationActor, OrderStatus } from "@prisma/client";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";

/**
 * ÇEKİM ↔ İPTAL DIŞLAMASI (callback tarafı). Başarı callback'i siparişi
 * kilitsiz okuyup `preparing` yazıyordu: okuma ile yazma arasında commit eden
 * bir iptal (alıcı, yönetici, 24s süpürmesi) eziliyor, iptal edilmiş sipariş
 * sessizce canlanıyordu. Artık sipariş satırları ödeme claim'inden SONRA,
 * durum okunmadan ÖNCE kilitlenir; iptal edilmiş sipariş canlandırılmaz,
 * mevcut otomatik iade ilkeliyle iade edilir.
 */
describe("PaymentFulfillmentService — iptal edilmiş siparişe gelen callback", () => {
  const makeService = (lockedStatus: OrderStatus) => {
    const calls: string[] = [];
    const tx: any = {
      $queryRaw: jest.fn().mockImplementation((sql: TemplateStringsArray) => {
        calls.push(`lock:${sql.join("?").replace(/\s+/g, " ").trim()}`);
        return Promise.resolve([]);
      }),
      payment: {
        updateMany: jest.fn().mockImplementation(() => {
          calls.push("claim");
          return Promise.resolve({ count: 1 });
        }),
      },
      order: {
        findUnique: jest.fn().mockImplementation(() => {
          calls.push("read");
          return Promise.resolve({
            status: lockedStatus,
            orderNumber: "ORD-1",
          });
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const paymentRefund = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new PaymentFulfillmentService(
      prisma,
      { del: jest.fn(), delPattern: jest.fn() } as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      paymentRefund as never,
      {} as never,
      undefined,
    );
    return { service, tx, calls, paymentRefund };
  };

  const payment = {
    id: "pay-1",
    orderId: "order-1",
    status: "pending",
    metadata: {},
    provider: "paytr",
  };

  it("claim → sipariş kilidi → okuma sırasıyla çalışır; iptali görüp otomatik iade eder, canlandırmaz", async () => {
    const { service, tx, calls, paymentRefund } = makeService(
      OrderStatus.cancelled,
    );

    await expect(
      service.processSuccessfulPayment(payment, "txn-1"),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      "claim",
      "lock:SELECT id FROM orders WHERE id = ? FOR UPDATE",
      "read",
    ]);
    expect(tx.order.update).not.toHaveBeenCalled();
    // Mevcut ilkel: iptal edilmiş siparişin aktörü processRefund'da korunur.
    expect(paymentRefund.processRefund).toHaveBeenCalledWith(
      "order-1",
      undefined,
      { cancelledBy: CancellationActor.system },
    );
  });
});
