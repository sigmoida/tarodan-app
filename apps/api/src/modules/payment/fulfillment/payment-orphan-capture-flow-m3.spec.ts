import { PspReconciliationService } from "../reconciliation/psp-reconciliation.service";
import { PaymentStatus, Prisma } from "@prisma/client";

/**
 * FLOW-M3 (2.1): detectOrphanCapturedFailedPayments — `failed` işaretli ama PayTR'da
 * GERÇEKTEN çekilmiş ödemeleri yakalar. Sipariş hâlâ ödenebilirse CAS ile failed→pending
 * resetleyip tamamlar (telafi); değilse yüksek-öncelik ALARM (oto-iade Faz 4).
 */
describe("PspReconciliationService.detectOrphanCapturedFailedPayments — FLOW-M3", () => {
  const makeService = (opts: {
    candidate: any;
    query: (oid: string) => any;
    full: any;
    casCount?: number;
    attempts?: Array<{ merchantOid: string; chargedAmount: Prisma.Decimal }>;
  }) => {
    const prisma = {
      // Without attempts (forms signed before them) every oid falls back
      // to `amount`.
      paymentChargeAttempt: {
        findFirst: jest.fn().mockResolvedValue(null),
        // The sweep reads the attempts of the whole batch at once.
        findMany: jest.fn().mockResolvedValue(
          (opts.attempts ?? []).map((a) => ({
            paymentId: opts.candidate.id,
            ...a,
          })),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([opts.candidate]),
        findUnique: jest.fn().mockResolvedValue(opts.full),
        updateMany: jest.fn().mockResolvedValue({ count: opts.casCount ?? 1 }),
      },
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((k: string) => {
        if (k === "PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") return "0.05";
        return undefined;
      }),
    };
    const queryPaymentStatus = jest.fn(opts.query);
    const paymentProviders = { resolve: () => ({ queryPaymentStatus }) };
    const paymentCommon = {
      collectPaymentOids: jest.fn().mockReturnValue(["oid1"]),
    };
    const processSuccessfulPayment = jest.fn().mockResolvedValue(true);
    const paymentFulfillment = { processSuccessfulPayment };
    const service = new PspReconciliationService(
      prisma as any, // prisma
      cache as any, // cache
      configService as any, // configService
      paymentProviders as any, // paymentProviders
      paymentCommon as any, // paymentCommon
      paymentFulfillment as any, // paymentFulfillment
    );
    return { service, prisma, processSuccessfulPayment };
  };

  const candidate = {
    id: "pay-1",
    amount: 100,
    providerConversationId: "oid1",
    metadata: {},
    orderId: "o1",
    checkoutGroupId: null,
  };

  it("çekilmiş + sipariş ödenebilir: CAS reset + tamamla (telafi)", async () => {
    const { service, prisma, processSuccessfulPayment } = makeService({
      candidate,
      query: () => ({
        ok: true,
        paymentTotalTl: 100,
        paymentDate: "x",
        paymentType: "card",
        installmentCount: 0,
        currency: "TL",
      }),
      full: {
        orderId: "o1",
        order: {
          status: "pending_payment",
          buyer: {},
          seller: {},
          product: {},
        },
        checkoutGroup: null,
      },
    });

    const res = await service.detectOrphanCapturedFailedPayments();

    // failed→pending CAS reset yapılmalı
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: PaymentStatus.failed },
      data: { status: PaymentStatus.pending },
    });
    // The inquiry's payment method reaches fulfillment like a callback's
    // (single payment: taksit 0).
    expect(processSuccessfulPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("oid1"),
      "oid1",
      { paymentType: "card", installmentCount: 0, currency: "TL" },
    );
    expect(res).toEqual({ checked: 1, recovered: 1, alarms: 0 });
  });

  it("çekilmiş + sipariş gitmiş (cancelled): ALARM, reset YAPILMAZ", async () => {
    const { service, prisma, processSuccessfulPayment } = makeService({
      candidate,
      query: () => ({ ok: true, paymentTotalTl: 100, paymentDate: "x" }),
      full: {
        orderId: "o1",
        order: { status: "cancelled", buyer: {}, seller: {}, product: {} },
        checkoutGroup: null,
      },
    });

    const res = await service.detectOrphanCapturedFailedPayments();

    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
    expect(res).toEqual({ checked: 1, recovered: 0, alarms: 1 });
  });

  it("PayTR'da capture yok: telafi/alarm yok (normal failed ödeme)", async () => {
    const { service, prisma, processSuccessfulPayment } = makeService({
      candidate,
      query: () => ({ ok: false }),
      full: null,
    });

    const res = await service.detectOrphanCapturedFailedPayments();

    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
    expect(res).toEqual({ checked: 1, recovered: 0, alarms: 0 });
  });

  it("dedup: cache'te işaretliyse PayTR'ye sorulmaz", async () => {
    const { service, prisma } = makeService({
      candidate,
      query: () => ({ ok: true, paymentTotalTl: 100 }),
      full: null,
    });
    // cache.get true → skip
    (service as any).cache.get.mockResolvedValue(true);

    const res = await service.detectOrphanCapturedFailedPayments();

    expect(res.checked).toBe(0);
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  describe("installment oids (ADR 0019, PSP scale)", () => {
    // oid1 was signed for 3 installments: PayTR charged C = 106.64, T = 100.
    const attempts = [
      { merchantOid: "oid1", chargedAmount: new Prisma.Decimal("106.64") },
    ];
    const payable = {
      orderId: "o1",
      order: {
        status: "pending_payment",
        buyer: {},
        seller: {},
        product: {},
      },
      checkoutGroup: null,
    };
    const charged = (paymentTotalTl: number) => () => ({
      ok: true,
      paymentTotalTl,
      paymentDate: "x",
      paymentType: "card",
      installmentCount: 3,
      currency: "TL",
    });

    it("recovers an orphan installment capture at the C its oid was signed for", async () => {
      const { service, processSuccessfulPayment } = makeService({
        candidate,
        query: charged(106.64),
        full: payable,
        attempts,
      });

      const res = await service.detectOrphanCapturedFailedPayments();

      expect(processSuccessfulPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("oid1"),
        "oid1",
        { paymentType: "card", installmentCount: 3, currency: "TL" },
      );
      expect(res).toEqual({ checked: 1, recovered: 1, alarms: 0 });
    });

    it("leaves an installment oid PayTR reports at T alone", async () => {
      const { service, prisma, processSuccessfulPayment } = makeService({
        candidate,
        query: charged(100),
        full: payable,
        attempts,
      });

      const res = await service.detectOrphanCapturedFailedPayments();

      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(processSuccessfulPayment).not.toHaveBeenCalled();
      expect(res).toEqual({ checked: 1, recovered: 0, alarms: 0 });
    });
  });
});
