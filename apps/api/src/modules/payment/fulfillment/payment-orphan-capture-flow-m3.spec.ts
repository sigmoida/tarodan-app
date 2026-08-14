import { PspReconciliationService } from "../reconciliation/psp-reconciliation.service";
import { PaymentStatus } from "@prisma/client";

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
  }) => {
    const prisma = {
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
      query: () => ({ ok: true, paymentTotalTl: 100, paymentDate: "x" }),
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
    expect(processSuccessfulPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("oid1"),
      "oid1",
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
});
