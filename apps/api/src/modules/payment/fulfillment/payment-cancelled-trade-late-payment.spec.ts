import {
  CancellationActor,
  OutboxStatus,
  PaymentStatus,
  TradeStatus,
} from "@prisma/client";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { PaymentOutboxHandlers } from "../payment-outbox-handlers.service";
import { OutboxService } from "../../outbox/outbox.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND,
  tradeCancelledPaymentRefundDedupeKey,
} from "../../outbox/outbox.types";
import { TRADE_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";
import { tradePaymentRefundableAmountFor } from "../../trade/helpers/trade-refund-policy";

/**
 * İPTAL EDİLMİŞ takasa sonradan tamamlanan ödeme — para platformda kalmaz.
 *
 * Her iptal yolu (kullanıcı, süre dolumu, platform) iadeyi iptal anında
 * TAMAMLANMIŞ satırlara yapar. Ödemesi o an PayTR'da olan tarafın callback'i
 * iptalden sonra gelirse satır `completed` olur ama hiçbir yol onu iade etmez.
 * Ödemenin tamamlandığı TEK yerde (bu servis) iptal edilmiş takas görülür ve
 * ödeme mevcut izlenen iadeye (`refundTradeCashTracked`, ödeyene kapsamlı)
 * verilir. İş ödeme tx'iyle atomik kuyruğa girer ve YALNIZ drainer işler —
 * PayTR callback'inin içinden (ödeme henüz "siteye bildirilmeden") iade
 * denenmez; erken denemeyi PayTR reddederse satır yeniden kuyruğa girer.
 */
describe("PaymentFulfillmentService — iptal edilmiş takasa gelen ödeme", () => {
  interface OutboxRow {
    type: string;
    payload: unknown;
    dedupeKey: string;
    status: OutboxStatus;
  }

  /** İptalin nasıl yazıldığı (aktör, gerekçe, son tarihler). */
  interface CancelShape {
    cancelledBy?: CancellationActor | null;
    cancelReason?: string | null;
    paymentDeadline?: Date | null;
    shippingDeadline?: Date | null;
  }

  const makeService = (
    opts: {
      tradeStatus?: TradeStatus;
      withOutbox?: boolean;
      cancel?: CancelShape;
    } = {},
  ) => {
    const calls: string[] = [];
    const outboxRows: OutboxRow[] = [];
    /** Geç tamamlanan ödemenin satırı (v2: 150 hizmet bedeli + 80 kargo). */
    const tcpRow = {
      totalAmount: 230,
      shippingAmount: 80,
      tradeFeeAmount: 150,
      commission: 0,
      commissionTaxAmount: 0,
      fullRefundEntitled: false,
    };
    const tx = {
      $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
        calls.push(strings.join("?").trim());
        return [];
      }),
      payment: { update: jest.fn().mockResolvedValue({}) },
      tradeCashPayment: {
        findUnique: jest.fn().mockResolvedValue({ tradeId: "trade-1" }),
        update: jest.fn(
          async ({ data }: { data: { fullRefundEntitled?: boolean } }) => {
            if (data.fullRefundEntitled !== undefined) {
              tcpRow.fullRefundEntitled = data.fullRefundEntitled;
              calls.push("tcp.faultless");
            } else {
              calls.push("tcp.update");
            }
            return { id: "tcp-2", tradeId: "trade-1", payerId: "u2" };
          },
        ),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { status: PaymentStatus.completed },
            { status: PaymentStatus.completed },
          ]),
      },
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          id: "trade-1",
          status: opts.tradeStatus ?? TradeStatus.cancelled,
          version: 4,
          initiatorId: "u1",
          receiverId: "u2",
          ...opts.cancel,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: {
        upsert: jest.fn(
          async ({
            where,
            create,
          }: {
            where: { dedupeKey: string };
            create: { type: string; payload: unknown };
          }) => {
            calls.push("outbox.enqueue");
            outboxRows.push({
              type: create.type,
              payload: create.payload,
              dedupeKey: where.dedupeKey,
              status: OutboxStatus.pending,
            });
            return {};
          },
        ),
      },
    };
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      outboxEvent: {
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { dedupeKey: string; status: OutboxStatus };
            data: { status: OutboxStatus };
          }) => {
            const hit = outboxRows.filter(
              (row) =>
                row.dedupeKey === where.dedupeKey &&
                row.status === where.status,
            );
            hit.forEach((row) => (row.status = data.status));
            return { count: hit.length };
          },
        ),
      },
    };
    const eventService = {
      emitTradeCashCleared: jest.fn(),
      emitTradeReadyForShipping: jest.fn().mockResolvedValue(undefined),
    };
    const finalizer = {
      recordTradeCashCapture: jest.fn(async () => {
        calls.push("capture");
      }),
    };
    const paymentRefund = {
      refundTradeCashTracked: jest.fn(async () => {
        calls.push("refund");
        return { refunded: true, failed: false };
      }),
    };
    const outbox = new OutboxService();
    const d = {} as never;
    const service = new PaymentFulfillmentService(
      prisma as never,
      d,
      d,
      eventService as never,
      d,
      d,
      d,
      d,
      d,
      d,
      paymentRefund as never,
      finalizer as never,
      d,
      opts.withOutbox === false ? undefined : outbox,
    );
    jest
      .spyOn(
        service as unknown as { claimPaymentCompleted: () => Promise<boolean> },
        "claimPaymentCompleted",
      )
      .mockResolvedValue(true);
    const run = () =>
      (
        service as unknown as {
          processSuccessfulTradeCashPayment: (
            payment: { id: string; tradeCashPaymentId: string },
            transactionId: string,
          ) => Promise<boolean>;
        }
      ).processSuccessfulTradeCashPayment(
        { id: "pay-2", tradeCashPaymentId: "tcp-2" },
        "txn-2",
      );
    return {
      run,
      tx,
      prisma,
      calls,
      outbox,
      outboxRows,
      eventService,
      paymentRefund,
      tcpRow,
    };
  };

  it("ödemeyi tamamlar ve aynı tx'te ödeme satırı başına bir iade işi kuyruğa alır", async () => {
    const h = makeService();

    await expect(h.run()).resolves.toBe(true);

    expect(h.outboxRows).toEqual([
      {
        type: OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND,
        payload: {
          tradeId: "trade-1",
          payerId: "u2",
          tradeCashPaymentId: "tcp-2",
        },
        dedupeKey: tradeCancelledPaymentRefundDedupeKey("tcp-2"),
        // Drainer'a bırakılır (callback yanıtlandıktan sonra işlenir).
        status: OutboxStatus.pending,
      },
    ]);
  });

  it("PayTR callback'inin içinden iade DENEMEZ (ödeme henüz 'siteye bildirilmedi')", async () => {
    const h = makeService();

    await h.run();

    expect(h.paymentRefund.refundTradeCashTracked).not.toHaveBeenCalled();
    // Defter yakalaması yine yazılır; iade bunu drainer'da tersler.
    expect(h.calls).toContain("capture");
  });

  it("iptal edilmiş takası kargoya almaz, sevkiyat duyurusu yapmaz", async () => {
    const h = makeService();

    await h.run();

    expect(h.tx.trade.updateMany).not.toHaveBeenCalled();
    expect(h.eventService.emitTradeReadyForShipping).not.toHaveBeenCalled();
    expect(h.eventService.emitTradeCashCleared).not.toHaveBeenCalled();
  });

  it("takas satırını ödeme satırına dokunmadan önce kilitler (iptal yollarıyla aynı sıra)", async () => {
    const h = makeService();

    await h.run();

    const lock = h.calls.findIndex((c) =>
      c.startsWith("SELECT id FROM trades WHERE id ="),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(h.calls.indexOf("tcp.update"));
  });

  describe("drainer handler'ı", () => {
    type RefundResult = {
      refunded: boolean;
      failed: boolean;
      deferred?: boolean;
    };
    const makeHandler = (result: RefundResult) => {
      const paymentRefund = {
        refundTradeCashTracked: jest.fn().mockResolvedValue(result),
      };
      const registry = new OutboxHandlerRegistry();
      new PaymentOutboxHandlers(
        registry,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        paymentRefund as never,
      ).onModuleInit();
      const handler = registry.get(OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND)!;
      const payload = {
        tradeId: "trade-1",
        payerId: "u2",
        tradeCashPaymentId: "tcp-2",
      };
      const run = (attempts: number, maxAttempts = 8) =>
        handler(payload, { attempts, maxAttempts } as never);
      return { paymentRefund, run };
    };

    it("iadeyi mevcut izlenen yoldan, ödeyene kapsamlı ve erken-deneme ertelemesiyle yapar", async () => {
      const h = makeHandler({ refunded: true, failed: false });

      await expect(h.run(0)).resolves.toBeUndefined();

      expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
        "trade-1",
        { payerId: "u2", deferIfNotYetSynced: true },
      );
    });

    it("PayTR 'henüz bildirilmedi' derse satırı tamamlamaz, yeniden kuyruğa alır (fırlatır)", async () => {
      const h = makeHandler({ refunded: false, failed: false, deferred: true });

      await expect(h.run(2)).rejects.toThrow(/re-queued/);
    });

    it("son denemede erteleme yapmaz: iş işaret + retry cron'una devredilir, satır kapanır", async () => {
      const h = makeHandler({ refunded: false, failed: true });

      await expect(h.run(7, 8)).resolves.toBeUndefined();

      expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
        "trade-1",
        { payerId: "u2", deferIfNotYetSynced: false },
      );
    });

    it("diğer sağlayıcı hataları satırı kapatır (izlenen yol işaret + retry cron'una bırakır)", async () => {
      const h = makeHandler({ refunded: false, failed: true });

      await expect(h.run(0)).resolves.toBeUndefined();
    });
  });

  it("outbox yoksa (dar kurulum) iade yine anında yapılır", async () => {
    const h = makeService({ withOutbox: false });

    await h.run();

    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
      "trade-1",
      { payerId: "u2" },
    );
  });

  /**
   * Karar (2026-10-05): ödeme süresi dolumu iptalinde geç tamamlanan ödeme
   * hizmet bedeli dahil TAM iade alır; kendi takasını iptal eden tarafın geç
   * ödemesi kesintili kalır; platform iptali değişmez.
   */
  describe("geç ödemenin kusur kararı", () => {
    /** Satırın iade tutarı — iade yolunun kullandığı politika fonksiyonuyla. */
    const refundAmountOf = (row: {
      totalAmount: number;
      shippingAmount: number;
      tradeFeeAmount: number;
      commission: number;
      commissionTaxAmount: number;
      fullRefundEntitled: boolean;
    }) =>
      tradePaymentRefundableAmountFor(
        {
          paymentStatus: PaymentStatus.completed,
          provider: "paytr",
          totalAmount: row.totalAmount,
          shippingAmount: row.shippingAmount,
          tradeFeeAmount: row.tradeFeeAmount,
          commissionAmount: row.commission,
          commissionTaxAmount: row.commissionTaxAmount,
          fullRefundEntitled: row.fullRefundEntitled,
        },
        { handedToCargo: false },
      );

    const sweepCancel: CancelShape = {
      cancelledBy: CancellationActor.system,
      cancelReason: TRADE_CANCEL_REASON.autoExpired,
      paymentDeadline: new Date("2026-10-05T10:00:00.000Z"),
      shippingDeadline: null,
    };

    it("ödeme süresi dolumu iptali: satır kusursuz işaretlenir → hizmet bedeli dahil tam iade", async () => {
      const h = makeService({ cancel: sweepCancel });

      await h.run();

      expect(h.tcpRow.fullRefundEntitled).toBe(true);
      expect(refundAmountOf(h.tcpRow)).toBe(230);
    });

    it("bayrak, iade satırıyla AYNI tx'te ve kuyruğa almadan ÖNCE yazılır", async () => {
      const h = makeService({ cancel: sweepCancel });

      await h.run();

      expect(h.tx.tradeCashPayment.update).toHaveBeenCalledWith({
        where: { id: "tcp-2" },
        data: { fullRefundEntitled: true },
      });
      expect(h.calls.indexOf("tcp.faultless")).toBeGreaterThan(-1);
      expect(h.calls.indexOf("tcp.faultless")).toBeLessThan(
        h.calls.indexOf("outbox.enqueue"),
      );
    });

    it.each([CancellationActor.buyer, CancellationActor.seller])(
      "taraf iptali (%s), iptal edenin kendi geç ödemesi: bayrak yazılmaz → hizmet bedeli düşülür",
      async (cancelledBy) => {
        const h = makeService({
          cancel: {
            ...sweepCancel,
            cancelledBy,
            // Taraf, sürenin dolum gerekçesiyle aynı metni yazsa bile.
            cancelReason: TRADE_CANCEL_REASON.autoExpired,
          },
        });

        await h.run();

        expect(h.calls).not.toContain("tcp.faultless");
        expect(h.tcpRow.fullRefundEntitled).toBe(false);
        expect(refundAmountOf(h.tcpRow)).toBe(80);
        // İade yine kuyruğa alınır (kesintili tutarla).
        expect(h.outboxRows).toHaveLength(1);
      },
    );

    it("platform iptali: bu yol bayrağa dokunmaz (iptal anında hepsi zaten kusursuz)", async () => {
      const h = makeService({
        cancel: {
          ...sweepCancel,
          cancelledBy: CancellationActor.platform,
          cancelReason: "Tarodan tarafından iptal edildi: Stok hatası",
        },
      });

      await h.run();

      expect(h.calls).not.toContain("tcp.faultless");
      expect(h.outboxRows).toHaveLength(1);
    });

    it("başka bir sistem iptali (stok tükendi) karar kapsamında değildir", async () => {
      const h = makeService({
        cancel: {
          ...sweepCancel,
          cancelReason: TRADE_CANCEL_REASON.stockDepleted,
        },
      });

      await h.run();

      expect(h.calls).not.toContain("tcp.faultless");
    });
  });

  it.each([TradeStatus.awaiting_payment, TradeStatus.shipping_to_warehouse])(
    "takas %s ise iade yolu çalışmaz",
    async (tradeStatus) => {
      const h = makeService({ tradeStatus });

      await h.run();

      expect(h.outboxRows).toHaveLength(0);
      expect(h.paymentRefund.refundTradeCashTracked).not.toHaveBeenCalled();
    },
  );
});
