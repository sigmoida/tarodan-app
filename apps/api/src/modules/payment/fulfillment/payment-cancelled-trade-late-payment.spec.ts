import { OutboxStatus, PaymentStatus, TradeStatus } from "@prisma/client";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { PaymentOutboxHandlers } from "../payment-outbox-handlers.service";
import { OutboxService } from "../../outbox/outbox.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND,
  tradeCancelledPaymentRefundDedupeKey,
} from "../../outbox/outbox.types";

/**
 * İPTAL EDİLMİŞ takasa sonradan tamamlanan ödeme — para platformda kalmaz.
 *
 * Her iptal yolu (kullanıcı, süre dolumu, platform) iadeyi iptal anında
 * TAMAMLANMIŞ satırlara yapar. Ödemesi o an PayTR'da olan tarafın callback'i
 * iptalden sonra gelirse satır `completed` olur ama hiçbir yol onu iade etmez.
 * Ödemenin tamamlandığı TEK yerde (bu servis) iptal edilmiş takas görülür ve
 * ödeme mevcut izlenen iadeye (`refundTradeCashTracked`, ödeyene kapsamlı)
 * verilir; iş ödeme tx'iyle atomik kuyruğa girer, çökmede drainer tamamlar.
 */
describe("PaymentFulfillmentService — iptal edilmiş takasa gelen ödeme", () => {
  interface OutboxRow {
    type: string;
    payload: unknown;
    dedupeKey: string;
    status: OutboxStatus;
  }

  const makeService = (
    opts: { tradeStatus?: TradeStatus; withOutbox?: boolean } = {},
  ) => {
    const calls: string[] = [];
    const outboxRows: OutboxRow[] = [];
    const tx = {
      $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
        calls.push(strings.join("?").trim());
        return [];
      }),
      payment: { update: jest.fn().mockResolvedValue({}) },
      tradeCashPayment: {
        findUnique: jest.fn().mockResolvedValue({ tradeId: "trade-1" }),
        update: jest.fn(async () => {
          calls.push("tcp.update");
          return { id: "tcp-2", tradeId: "trade-1", payerId: "u2" };
        }),
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
        status: OutboxStatus.completed,
      },
    ]);
  });

  it("iadeyi mevcut izlenen yoldan, ödeyene kapsamlı yapar — defter yakalamasından SONRA", async () => {
    const h = makeService();

    await h.run();

    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledTimes(1);
    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
      "trade-1",
      { payerId: "u2" },
    );
    expect(h.calls.indexOf("capture")).toBeLessThan(h.calls.indexOf("refund"));
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

  it("süreç commit ile iade arasında ölürse satır pending kalır ve drainer handler'ı iadeyi yapar", async () => {
    const h = makeService();
    jest
      .spyOn(h.outbox, "runInline")
      .mockRejectedValueOnce(new Error("SIGKILL after commit"));

    await expect(h.run()).rejects.toThrow("SIGKILL after commit");
    expect(h.paymentRefund.refundTradeCashTracked).not.toHaveBeenCalled();
    expect(h.outboxRows[0].status).toBe(OutboxStatus.pending);

    const registry = new OutboxHandlerRegistry();
    new PaymentOutboxHandlers(
      registry,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      h.paymentRefund as never,
    ).onModuleInit();
    await registry.get(OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND)!(
      h.outboxRows[0].payload,
      {} as never,
    );

    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
      "trade-1",
      { payerId: "u2" },
    );
  });

  it("iade sağlayıcıda başarısızsa iş yine kapanır (izlenen yol marker + retry cron'una bırakır)", async () => {
    const h = makeService();
    h.paymentRefund.refundTradeCashTracked.mockResolvedValueOnce({
      refunded: false,
      failed: true,
    });

    await expect(h.run()).resolves.toBe(true);
    expect(h.outboxRows[0].status).toBe(OutboxStatus.completed);
  });

  it("outbox yoksa (dar kurulum) iade yine anında yapılır", async () => {
    const h = makeService({ withOutbox: false });

    await h.run();

    expect(h.paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
      "trade-1",
      { payerId: "u2" },
    );
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
