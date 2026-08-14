import { PaymentStatus, TradeStatus } from "@prisma/client";
import { PaymentFulfillmentService } from "../fulfillment/payment-fulfillment.service";

/**
 * TAKAS DEPO KAPISI (v2) — süreç İKİ ödeme tamamlanmadan başlamaz.
 *
 * v1'de tek bir ödeme vardı, dolayısıyla o ödemenin callback'i takası doğrudan
 * `shipping_to_warehouse`a alıyordu. v2'de iki taraf ayrı ayrı ödüyor: tek
 * taraflı ödemede ürünler kargoya ÇIKMAMALI, aksi halde ödemeyen taraf bedel
 * ödemeden malı gönderilmiş olur.
 *
 * İki PayTR callback'i aynı anda gelebilir; bu yüzden sayım tx içinde yapılır ve
 * geçiş `version` guard'ıyla yazılır — yarışı kaybeden callback sevkiyatı ikinci
 * kez tetiklemez (etiketler iki kez oluşmaz).
 */
describe("PaymentFulfillmentService — takas iki-ödeme kapısı", () => {
  const makeService = (opts: {
    siblingStatuses: PaymentStatus[];
    tradeStatus?: TradeStatus;
    /** Yarışın kaybedildiği durum: guard'lı update 0 satır etkiler. */
    updateCount?: number;
  }) => {
    const trade = {
      id: "trade-1",
      status: opts.tradeStatus ?? TradeStatus.awaiting_payment,
      version: 3,
    };
    const tx = {
      payment: { update: jest.fn().mockResolvedValue({}) },
      tradeCashPayment: {
        update: jest.fn().mockResolvedValue({ tradeId: "trade-1" }),
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.siblingStatuses.map((status) => ({ status })),
          ),
      },
      trade: {
        findUnique: jest.fn().mockResolvedValue(trade),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.updateCount ?? 1 }),
      },
    };
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    // Kapı mantığı yalnız prisma'yı kullanır; kalan bağımlılıklar boş taklit.
    // Tek istisna: defter yakalaması post-commit çağrılır (best-effort).
    const d = {} as any;
    // Post-commit yayınlar best-effort; kapı testinde yalnız var olmaları yeter.
    const eventService = {
      emitTradeCashCleared: jest.fn().mockResolvedValue(undefined),
      // "Kargoya hazır" yayını = sevkiyat tetiği; kapı bunu bastırmalı.
      emitTradeReadyForShipping: jest.fn().mockResolvedValue(undefined),
    } as any;
    const finalizer = {
      recordTradeCashCapture: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new PaymentFulfillmentService(
      prisma as any,
      d,
      d,
      eventService,
      d,
      d,
      d,
      d,
      d,
      d,
      d,
      finalizer,
      d,
      d,
    );
    // claimPaymentCompleted tx-içi audit/claim yolunu temsil eder; kapı mantığı
    // onun ALTINDA çalışır, bu yüzden başarılı claim varsayılır.
    jest.spyOn(service as any, "claimPaymentCompleted").mockResolvedValue(true);
    return { service, tx, eventService };
  };

  const run = (service: PaymentFulfillmentService) =>
    (service as any).processSuccessfulTradeCashPayment(
      { id: "pay-1", tradeCashPaymentId: "tcp-1" },
      "txn-1",
    );

  it("tek taraf ödediyse takası kargoya ALMAZ", async () => {
    const { service, tx } = makeService({
      siblingStatuses: [PaymentStatus.completed, PaymentStatus.pending],
    });

    await run(service);

    expect(tx.trade.updateMany).not.toHaveBeenCalled();
  });

  it("iki ödeme de tamamlanınca kargoya alır", async () => {
    const { service, tx, eventService } = makeService({
      siblingStatuses: [PaymentStatus.completed, PaymentStatus.completed],
    });

    await run(service);

    expect(tx.trade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "trade-1",
          version: 3,
          status: TradeStatus.awaiting_payment,
        }),
        data: expect.objectContaining({
          status: TradeStatus.shipping_to_warehouse,
        }),
      }),
    );
    expect(eventService.emitTradeReadyForShipping).toHaveBeenCalled();
  });

  it("eşzamanlı callback yarışını kaybeden sevkiyatı tetiklemez", async () => {
    const { service, eventService } = makeService({
      siblingStatuses: [PaymentStatus.completed, PaymentStatus.completed],
      updateCount: 0, // guard'lı update hiçbir satırı etkilemedi
    });

    // Ödemenin kendisi tamamlanmıştır (dönüş true) — bastırılan yalnız İKİNCİ
    // kez sevkiyat tetiklemektir; aksi halde etiketler iki kez oluşurdu.
    await expect(run(service)).resolves.toBe(true);
    expect(eventService.emitTradeReadyForShipping).not.toHaveBeenCalled();
  });

  it("takas zaten kargoya alınmışsa tekrar geçiş yapmaz", async () => {
    const { service, tx } = makeService({
      siblingStatuses: [PaymentStatus.completed, PaymentStatus.completed],
      tradeStatus: TradeStatus.shipping_to_warehouse,
    });

    await run(service);

    expect(tx.trade.updateMany).not.toHaveBeenCalled();
  });
});
