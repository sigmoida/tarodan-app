import { BadRequestException } from "@nestjs/common";
import { TradeStatus } from "@prisma/client";
import { PaymentTradeRefundService } from "./payment-trade-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import { PaymentOutboxHandlers } from "../payment-outbox-handlers.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import { OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND } from "../../outbox/outbox.types";
import { i18nMessage } from "../../i18n";

/**
 * MONEY-H2: refundTradeCashTracked — takas nakit iadesini failure-tracking ile yapar.
 * Başarısızlıkta trade.refundFailureReason marker'ı yazılır (admin retryTradeRefund +
 * retryFailedTradeRefunds cron'u toparlar); ASLA throw etmez. Başarıda marker temizlenir.
 */
describe("PaymentTradeRefundService.refundTradeCashTracked — MONEY-H2 failure tracking", () => {
  const TRADE_ID = "trade-1";

  const makeService = () => {
    const prisma = {
      trade: { update: jest.fn().mockResolvedValue({}) },
      tradeCashPayment: {
        // Başarı yolunda iade edilen satırın sahibi findFirst ile çözülür;
        // hata yolunda tek-satırlı (v1) takasta sahibi findMany(take:2) bulur
        // (iki satırlı v2'de taraf belirsiz → null, yanlış tarafa bildirim yok).
        findFirst: jest.fn().mockResolvedValue({ payerId: "payer-1" }),
        findMany: jest.fn().mockResolvedValue([{ payerId: "payer-1" }]),
      },
    };
    const eventService = {
      emitTradeRefundCompleted: jest.fn().mockResolvedValue(undefined),
      emitTradeRefundFailed: jest.fn().mockResolvedValue(undefined),
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const service = new PaymentTradeRefundService(
      prisma as any,
      configService as any,
      {} as any, // paymentProviders
      eventService as any,
      { record: jest.fn() } as any, // providerEvents
      new PaymentRefundAttemptService(prisma as any), // attempts
    );
    return { service, prisma, eventService };
  };

  it("iade PayTR'da patlarsa: throw ETMEZ, refundFailureReason marker'ı yazar, refund-failed yayınlar", async () => {
    const { service, prisma, eventService } = makeService();
    jest
      .spyOn(service, "refundTradeCashPaymentIfCompleted")
      .mockRejectedValue(new Error("PayTR down"));

    const r = await service.refundTradeCashTracked(TRADE_ID);

    expect(r.failed).toBe(true);
    expect(r.refunded).toBe(false);
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRADE_ID },
        data: expect.objectContaining({
          refundFailureReason: expect.stringContaining("PayTR down"),
          refundFailureAt: expect.any(Date),
        }),
      }),
    );
    expect(eventService.emitTradeRefundFailed).toHaveBeenCalledWith(
      expect.objectContaining({ tradeId: TRADE_ID, cashPayerId: "payer-1" }),
    );
  });

  it("iade başarılıysa: marker'ı temizler, refund-completed yayınlar", async () => {
    const { service, prisma, eventService } = makeService();
    jest
      .spyOn(service, "refundTradeCashPaymentIfCompleted")
      .mockResolvedValue({ refunded: true, paymentId: "pay-1" });

    const r = await service.refundTradeCashTracked(TRADE_ID);

    expect(r.failed).toBe(false);
    expect(r.refunded).toBe(true);
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRADE_ID },
        data: { refundFailureReason: null, refundFailureAt: null },
      }),
    );
    expect(eventService.emitTradeRefundCompleted).toHaveBeenCalled();
    expect(eventService.emitTradeRefundFailed).not.toHaveBeenCalled();
  });

  it("iade edilecek tamamlanmış ödeme yoksa (skip): marker temizlenir, refund-completed yayınlanmaz, failed değildir", async () => {
    const { service, prisma, eventService } = makeService();
    jest.spyOn(service, "refundTradeCashPaymentIfCompleted").mockResolvedValue({
      refunded: false,
      skippedReason: "already_refunded",
    });

    const r = await service.refundTradeCashTracked(TRADE_ID);

    expect(r.failed).toBe(false);
    expect(r.refunded).toBe(false);
    expect(r.skippedReason).toBe("already_refunded");
    // marker temizlenir (no-op da olsa güvenli), completed yayınlanmaz
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { refundFailureReason: null, refundFailureAt: null },
      }),
    );
    expect(eventService.emitTradeRefundCompleted).not.toHaveBeenCalled();
  });
});

/**
 * Kapsamlı (tek taraf) iade, BAŞKA bir tarafın başarısız iadesinin işaretini
 * silmemeli. Senaryo: platform iptali; A ödemiş, B'nin ödemesi PayTR'da.
 * A'nın iadesi sağlayıcıda patlar → `refundFailureReason`. B'nin callback'i
 * gelir; B'nin kapsamlı iadesi (drainer handler'ı) başarılı olur. İşaret
 * silinseydi `retryFailedTradeRefunds` A'yı bir daha görmez, admin panelindeki
 * "iade başarısız" uyarısı da kaybolurdu.
 */
describe("PaymentTradeRefundService.refundTradeCashTracked — kapsamlı iade ve hata işareti", () => {
  const TRADE_ID = "trade-1";

  const makeService = (
    outstandingAfterRefund: number | Error,
    tradeStatus: TradeStatus = TradeStatus.cancelled,
  ) => {
    const state = {
      refundFailureReason: "PayTR 503 (A)" as string | null,
    };
    const prisma = {
      trade: {
        findUnique: jest.fn().mockResolvedValue({ status: tradeStatus }),
        update: jest.fn(
          async ({
            data,
          }: {
            data: { refundFailureReason: string | null };
          }) => {
            state.refundFailureReason = data.refundFailureReason;
            return {};
          },
        ),
      },
      payment: {
        count:
          outstandingAfterRefund instanceof Error
            ? jest.fn().mockRejectedValue(outstandingAfterRefund)
            : jest.fn().mockResolvedValue(outstandingAfterRefund),
      },
      tradeCashPayment: {
        findFirst: jest.fn().mockResolvedValue({ payerId: "B" }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const eventService = {
      emitTradeRefundCompleted: jest.fn().mockResolvedValue(undefined),
      emitTradeRefundFailed: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentTradeRefundService(
      prisma as never,
      { get: jest.fn() } as never,
      {} as never,
      eventService as never,
      { record: jest.fn() } as never,
      new PaymentRefundAttemptService(prisma as never),
    );
    jest
      .spyOn(service, "refundTradeCashPaymentIfCompleted")
      .mockResolvedValue({ refunded: true, paymentId: "pay-B" });
    return { service, prisma, state, eventService };
  };

  it("A'nın iadesi hâlâ bekliyorsa B'nin kapsamlı başarısı işareti SİLMEZ", async () => {
    const { service, prisma, state } = makeService(1);

    const r = await service.refundTradeCashTracked(TRADE_ID, { payerId: "B" });

    expect(r).toEqual(
      expect.objectContaining({ refunded: true, failed: false }),
    );
    expect(state.refundFailureReason).toBe("PayTR 503 (A)");
    // Kalan borç, iade yolunun kendi (kapsamsız) filtresiyle sayılır.
    expect(prisma.payment.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tradeCashPayment: expect.not.objectContaining({ payerId: "B" }),
        status: "completed",
      }),
    });
  });

  it("başka iade borcu kalmadıysa kapsamlı başarı işareti temizler", async () => {
    const { service, state } = makeService(0);

    await service.refundTradeCashTracked(TRADE_ID, { payerId: "B" });

    expect(state.refundFailureReason).toBeNull();
  });

  it("kalan borç okunamazsa işaret korunur (kayıp iadeden yanlış alarm iyidir)", async () => {
    const { service, state } = makeService(new Error("db down"));

    await service.refundTradeCashTracked(TRADE_ID, { payerId: "B" });

    expect(state.refundFailureReason).toBe("PayTR 503 (A)");
  });

  it("itiraz tazminatı yeniden denemesi: tek tarafa başarılı iade bayat işareti temizler (diğer satır borç sayılmaz)", async () => {
    // İlk çözüm denemesinin iadesi patladı (işaret yazıldı), takas `disputed`
    // kaldı. Admin yeniden dener; tazminat iadesi başarılı. Diğer tarafın
    // satırı henüz damgasız ama alıcısına bırakılacak — iade borcu değil.
    const { service, prisma, state } = makeService(1, TradeStatus.disputed);

    const r = await service.refundTradeCashTracked(TRADE_ID, { payerId: "B" });

    expect(r).toEqual(
      expect.objectContaining({ refunded: true, failed: false }),
    );
    expect(prisma.payment.count).not.toHaveBeenCalled();
    expect(state.refundFailureReason).toBeNull();
  });

  it("kapsamsız çağrı bugünkü gibi işareti temizler (kalan borç sorulmaz)", async () => {
    const { service, prisma, state } = makeService(1);

    await service.refundTradeCashTracked(TRADE_ID);

    expect(prisma.payment.count).not.toHaveBeenCalled();
    expect(state.refundFailureReason).toBeNull();
  });

  it("drainer yolu: geç gelen B ödemesinin handler'ı A'nın işaretini korur", async () => {
    const { service, state } = makeService(1);
    const registry = new OutboxHandlerRegistry();
    new PaymentOutboxHandlers(
      registry,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        refundTradeCashTracked: service.refundTradeCashTracked.bind(service),
      } as never,
    ).onModuleInit();

    await registry.get(OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND)!(
      { tradeId: TRADE_ID, payerId: "B", tradeCashPaymentId: "tcp-B" },
      { attempts: 0, maxAttempts: 8 } as never,
    );

    expect(state.refundFailureReason).toBe("PayTR 503 (A)");
  });
});

describe("PaymentTradeRefundService.refundTradeCashTracked — 'henüz bildirilmedi' ertelemesi", () => {
  const makeService = () => {
    const prisma = {
      trade: { update: jest.fn().mockResolvedValue({}) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const eventService = {
      emitTradeRefundCompleted: jest.fn(),
      emitTradeRefundFailed: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentTradeRefundService(
      prisma as never,
      { get: jest.fn() } as never,
      {} as never,
      eventService as never,
      { record: jest.fn() } as never,
      new PaymentRefundAttemptService(prisma as never),
    );
    jest
      .spyOn(service, "refundTradeCashPaymentIfCompleted")
      .mockRejectedValue(
        new BadRequestException(
          i18nMessage("server.payment.paymentNotYetSynced"),
        ),
      );
    return { service, prisma, eventService };
  };

  it("erteleme istenirse: işaret yazılmaz, 'iade başarısız' yayınlanmaz, deferred döner", async () => {
    const { service, prisma, eventService } = makeService();

    const r = await service.refundTradeCashTracked("trade-1", {
      payerId: "B",
      deferIfNotYetSynced: true,
    });

    expect(r).toEqual(
      expect.objectContaining({
        refunded: false,
        failed: false,
        deferred: true,
      }),
    );
    expect(prisma.trade.update).not.toHaveBeenCalled();
    expect(eventService.emitTradeRefundFailed).not.toHaveBeenCalled();
  });

  it("erteleme istenmezse (son deneme / diğer yollar) bugünkü gibi işaret yazılır", async () => {
    const { service, prisma } = makeService();

    const r = await service.refundTradeCashTracked("trade-1", {
      payerId: "B",
    });

    expect(r.failed).toBe(true);
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refundFailureReason: expect.any(String),
        }),
      }),
    );
  });
});
