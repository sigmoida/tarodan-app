import { AdminPayoutService } from "./admin-payout.service";
import { TradeStatus } from "@prisma/client";

/**
 * Manuel release fast-path sözleşmesi.
 *
 * Admin bir escrow hold'unu serbest bıraktığında para saatlik
 * payment-release-holds + 15dk payout-process cron'larını BEKLEMEZ: transfer
 * satırı kapsamlı (scoped) olarak hemen oluşturulur ve worker'a bir
 * 'payout-process' fişi atılır. İki değişmez:
 *  1. Para HTTP process'inde akmaz — yalnız DB satırı + kuyruk fişi.
 *  2. Fast-path hatası release'i GERİ ALMAZ — release commit'lidir, cron'lar
 *     emniyet ağıdır; yanıt success:true + transferQueued:false döner.
 */
describe("AdminPayoutService — release sonrası anında payout", () => {
  const makeService = (opts?: {
    createRejects?: boolean;
    addRejects?: boolean;
  }) => {
    const prisma = {
      trade: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: TradeStatus.completed }),
      },
      tradeCashPayment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ releasedAt: new Date(), refundedAt: null }]),
      },
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const paymentService = {
      releasePayment: jest
        .fn()
        .mockResolvedValue({ success: true, holdId: "h1", amount: 100 }),
    };
    const payoutCore = {
      createPayoutsForReleasedHolds: opts?.createRejects
        ? jest.fn().mockRejectedValue(new Error("db down"))
        : jest.fn().mockResolvedValue(1),
    };
    const queue = {
      add: opts?.addRejects
        ? jest.fn().mockRejectedValue(new Error("redis down"))
        : jest.fn().mockResolvedValue({ id: "job-1" }),
    };
    const service = new AdminPayoutService(
      prisma as never,
      audit as never,
      paymentService as never,
      payoutCore as never,
      queue as never,
    );
    return { service, prisma, audit, paymentService, payoutCore, queue };
  };

  it("sipariş release'i: scoped oluşturma + payout-process fişi, yanıtta transferQueued", async () => {
    const { service, payoutCore, queue } = makeService();

    const res = await service.releasePayout("admin-1", "o-1", "erken", true);

    expect(payoutCore.createPayoutsForReleasedHolds).toHaveBeenCalledWith({
      orderId: "o-1",
    });
    expect(queue.add).toHaveBeenCalledWith(
      "payout-process",
      expect.objectContaining({
        manual: true,
        source: "admin-release",
        orderId: "o-1",
      }),
      { removeOnComplete: 50, removeOnFail: 50 },
    );
    expect(res).toMatchObject({
      success: true,
      transfersCreated: 1,
      transferQueued: true,
    });
  });

  it("scoped oluşturma düşerse release GERİ ALINMAZ: success + transferQueued:false, fiş atılmaz", async () => {
    const { service, queue } = makeService({ createRejects: true });

    const res = await service.releasePayout("admin-1", "o-1", "erken");

    expect(queue.add).not.toHaveBeenCalled();
    expect(res).toMatchObject({
      success: true,
      transfersCreated: 0,
      transferQueued: false,
    });
  });

  it("fiş atma düşerse de success: cron emniyet ağı devralır", async () => {
    const { service } = makeService({ addRejects: true });

    const res = await service.releasePayout("admin-1", "o-1", "erken");

    expect(res).toMatchObject({
      success: true,
      transfersCreated: 1,
      transferQueued: false,
    });
  });

  it("takas release'i (happy path) fast-path'i tradeId kapsamıyla koşar", async () => {
    const { service, payoutCore, queue } = makeService();

    const res = await service.releaseTradePaymentHold(
      "admin-1",
      "t-1",
      "erken",
      true,
    );

    expect(payoutCore.createPayoutsForReleasedHolds).toHaveBeenCalledWith({
      tradeId: "t-1",
    });
    expect(queue.add).toHaveBeenCalledWith(
      "payout-process",
      expect.objectContaining({ tradeId: "t-1" }),
      expect.anything(),
    );
    expect(res).toMatchObject({ success: true, transferQueued: true });
  });

  it("takasın idempotent 'zaten serbest' yolu da fast-path koşar (retry kurtarması)", async () => {
    const { service, prisma, payoutCore, queue } = makeService();
    // updateMany 0 satır açtı ama tüm satırlar zaten kapalı → idempotent başarı.
    prisma.tradeCashPayment.updateMany.mockResolvedValue({ count: 0 });

    const res = await service.releaseTradePaymentHold(
      "admin-1",
      "t-1",
      "tekrar",
    );

    expect(res).toMatchObject({ success: true, releasedRows: 0 });
    expect(payoutCore.createPayoutsForReleasedHolds).toHaveBeenCalledWith({
      tradeId: "t-1",
    });
    expect(queue.add).toHaveBeenCalled();
  });
});
