import { RefundAttemptStatus } from "@prisma/client";
import { RefundReconciliationService } from "./refund-reconciliation.service";

/**
 * Sonucu belirsiz (manual_review) iade denemelerinin durum-sorgu `returns` +
 * `reference_no` ile OTOMATİK çözümü:
 *  - Bizim referansımız PayTR'nin iade listesinde görünüyorsa → iade PayTR'ye
 *    ulaşmış → attempt `succeeded` (mevcut finalize yolu tamamlar).
 *  - Görünmüyorsa → istek hiç işlenmemiş → attempt `failed` (mevcut retry yolu
 *    güvenle yeniden gönderir).
 *  - Referanssız ama aynı tutarlı bir iade kaydı varsa BELİRSİZ (reference_no
 *    özelliğinden önceki denemeler böyle görünür) → dokunulmaz, insana kalır.
 *    Aksi halde başarılı eski iade "failed" sayılıp İKİNCİ KEZ iade edilirdi.
 */

const now = Date.now();
const OLD = new Date(now - 30 * 60 * 1000); // min-age (15 dk) geçmiş
const FRESH = new Date(now - 60 * 1000);

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaa1111-bbbb-2222-cccc-333344445555",
    paymentId: "pay-1",
    orderId: "order-1",
    tradeId: null,
    amount: 50,
    provider: "paytr",
    providerReference: "OID123",
    status: RefundAttemptStatus.manual_review,
    updatedAt: OLD,
    ...overrides,
  };
}

// createRefund'daki normalizasyonla aynı: UUID tireleri atılır.
const REF_NO = "aaaa1111bbbb2222cccc333344445555";

function makeHarness(opts: { attempts?: any[]; inquiry?: any }) {
  const state: { status: RefundAttemptStatus; data: Record<string, unknown> } =
    {
      status:
        (opts.attempts?.[0]?.status as RefundAttemptStatus) ??
        RefundAttemptStatus.manual_review,
      data: {},
    };
  const prisma = {
    state,
    refundAttempt: {
      findMany: jest.fn().mockResolvedValue(opts.attempts ?? []),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        if (where.status && where.status !== state.status) {
          return Promise.resolve({ count: 0 });
        }
        state.status = data.status ?? state.status;
        Object.assign(state.data, data);
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const queryPaymentStatus = jest.fn().mockResolvedValue(
    opts.inquiry ?? {
      ok: true,
      paymentTotalTl: 100,
      paymentAmountTl: 100,
      currency: "TL",
      returns: [],
    },
  );
  const providerEvents = { record: jest.fn() };
  const service = new RefundReconciliationService(
    prisma as any,
    {} as any, // paymentRefund — bu süpürmede kullanılmaz
    { resolve: () => ({ queryPaymentStatus }) } as any,
    { get: jest.fn().mockReturnValue(undefined) } as any,
    providerEvents as any,
  );
  return { service, prisma, queryPaymentStatus, providerEvents };
}

describe("RefundReconciliationService.resolveUnknownRefundOutcomes", () => {
  it("confirms the attempt when our reference_no appears in returns (amount matched)", async () => {
    const { service, prisma, providerEvents } = makeHarness({
      attempts: [makeAttempt()],
      inquiry: {
        ok: true,
        paymentTotalTl: 100,
        paymentAmountTl: 100,
        currency: "TL",
        providerFeeTl: 2.35,
        providerNetTl: 97.65,
        returns: [{ amountTl: 50, referenceNo: REF_NO, date: "2026-08-01" }],
      },
    });

    const r = await service.resolveUnknownRefundOutcomes();

    expect(r.confirmed).toBe(1);
    expect(prisma.state.status).toBe(RefundAttemptStatus.succeeded);
    expect(prisma.state.data.providerSucceededAt).toBeInstanceOf(Date);
    // Denetim satırı PSP kesintisiyle birlikte yazılır (ücret mutabakatı).
    expect(providerEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "status_inquiry",
        providerFee: 2.35,
        providerNet: 97.65,
      }),
    );
  });

  it("requeues (failed) when the provider has NO refund record for our reference", async () => {
    const { service, prisma } = makeHarness({
      attempts: [makeAttempt()],
      inquiry: {
        ok: true,
        paymentTotalTl: 100,
        paymentAmountTl: 100,
        currency: "TL",
        returns: [{ amountTl: 20, referenceNo: "baskasinin-referansi" }],
      },
    });

    const r = await service.resolveUnknownRefundOutcomes();

    expect(r.requeued).toBe(1);
    expect(prisma.state.status).toBe(RefundAttemptStatus.failed);
    expect(String(prisma.state.data.failureReason)).toContain("durum-sorgu");
  });

  it("leaves the attempt untouched when an UNREFERENCED same-amount return exists (ambiguous)", async () => {
    const { service, prisma } = makeHarness({
      attempts: [makeAttempt()],
      inquiry: {
        ok: true,
        paymentTotalTl: 100,
        paymentAmountTl: 100,
        currency: "TL",
        // reference_no'suz 50 TL iade: bizim referanssız eski denememiz OLABİLİR —
        // failed sayıp yeniden göndermek çift iade riski.
        returns: [{ amountTl: 50 }],
      },
    });

    const r = await service.resolveUnknownRefundOutcomes();

    expect(r.confirmed).toBe(0);
    expect(r.requeued).toBe(0);
    expect(prisma.state.status).toBe(RefundAttemptStatus.manual_review);
  });

  it("leaves the attempt untouched when the referenced amount mismatches", async () => {
    const { service, prisma } = makeHarness({
      attempts: [makeAttempt()],
      inquiry: {
        ok: true,
        paymentTotalTl: 100,
        paymentAmountTl: 100,
        currency: "TL",
        returns: [{ amountTl: 49, referenceNo: REF_NO }],
      },
    });

    const r = await service.resolveUnknownRefundOutcomes();

    expect(r.confirmed).toBe(0);
    expect(r.requeued).toBe(0);
    expect(prisma.state.status).toBe(RefundAttemptStatus.manual_review);
  });

  it("targets only aged manual_review paytr attempts (query filter)", async () => {
    const { service, prisma } = makeHarness({ attempts: [] });

    await service.resolveUnknownRefundOutcomes();

    // Genç denemeler sorguya hiç girmemeli: PayTR iadeyi timeout'umuzdan SONRA
    // işlemiş olabilir; min-age penceresi bu yarışı kapatır.
    const where = prisma.refundAttempt.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(RefundAttemptStatus.manual_review);
    expect(where.provider).toBe("paytr");
    expect(where.updatedAt.lt).toBeInstanceOf(Date);
    const ageMs = Date.now() - where.updatedAt.lt.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(14 * 60 * 1000);
  });

  it("skips attempts without a providerReference (oid yok → sorgulanamaz)", async () => {
    const { service, prisma, queryPaymentStatus } = makeHarness({
      attempts: [makeAttempt({ providerReference: null })],
    });

    const r = await service.resolveUnknownRefundOutcomes();

    expect(queryPaymentStatus).not.toHaveBeenCalled();
    expect(r.confirmed).toBe(0);
    expect(r.requeued).toBe(0);
    expect(prisma.state.status).toBe(RefundAttemptStatus.manual_review);
  });

  it("leaves the attempt untouched when the inquiry itself fails", async () => {
    const { service, prisma } = makeHarness({
      attempts: [makeAttempt()],
      inquiry: { ok: false, errMsg: "PayTR down" },
    });

    const r = await service.resolveUnknownRefundOutcomes();

    expect(r.confirmed).toBe(0);
    expect(r.requeued).toBe(0);
    expect(prisma.state.status).toBe(RefundAttemptStatus.manual_review);
  });
});
