import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PaymentStatus, PaytrMerchant, Prisma } from "@prisma/client";

/**
 * FLOW-H1: verifyPaymentFromClient (çift-çekim guard'ı) artık TÜM oid'leri tarar
 * (güncel providerConversationId + merchantOidHistory). Re-init sonrası capture ESKİ
 * oid'de olmuş olabilir; yalnız güncel oid'i sormak bunu kaçırıp ikinci çekime yol açardı.
 */
describe("PaymentLifecycleService.verifyPaymentFromClient — FLOW-H1 oid history scan", () => {
  const makeService = (
    queryImpl: (oid: string) => any,
    oids = ["oid2", "oid1"],
    paytrMerchant: PaytrMerchant = PaytrMerchant.marketplace,
    attempts: Array<{
      merchantOid: string;
      chargedAmount: Prisma.Decimal;
    }> = [],
  ) => {
    const payment = {
      id: "pay-1",
      status: PaymentStatus.pending,
      provider: "paytr",
      paytrMerchant,
      providerConversationId: "oid2",
      metadata: { merchantOidHistory: ["oid1"] },
      amount: 100,
      order: { buyer: {}, seller: {}, product: {} },
      tradeCashPayment: null,
    };
    const prisma = {
      // Without attempts (forms signed before them) every oid falls back
      // to `amount`.
      paymentChargeAttempt: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue(attempts),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
    };
    const queryPaymentStatus = jest.fn(queryImpl);
    const paymentProviders = {
      resolve: jest.fn(() => ({ queryPaymentStatus })),
    };
    const paymentCommon = {
      collectPaymentOids: jest.fn().mockReturnValue(oids),
    };
    const processSuccessfulPayment = jest.fn().mockResolvedValue(true);
    const paymentFulfillment = { processSuccessfulPayment };
    const configService = {
      get: jest.fn((k: string) =>
        k === "PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL" ? "0.05" : undefined,
      ),
    };
    const service = new PaymentLifecycleService(
      prisma as any,
      configService as any,
      paymentProviders as any,
      {} as any, // eventService
      paymentCommon as any,
      paymentFulfillment as any,
    );
    return {
      service,
      queryPaymentStatus,
      processSuccessfulPayment,
      paymentProviders,
    };
  };

  it("queries the merchant the payment is charged on (membership)", async () => {
    const { service, paymentProviders } = makeService(
      () => ({ ok: false }),
      ["oid2"],
      PaytrMerchant.membership,
    );
    await service.verifyPaymentFromClient("pay-1", { internal: true });
    expect(paymentProviders.resolve).toHaveBeenCalledWith(
      "paytr",
      PaytrMerchant.membership,
    );
  });

  it("capture ESKİ oid'de (history): güncel oid boş dönse bile yakalanır ve tamamlanır", async () => {
    const { service, queryPaymentStatus, processSuccessfulPayment } =
      makeService((oid) =>
        oid === "oid1"
          ? {
              ok: true,
              paymentTotalTl: 100,
              paymentDate: "2026-01-01",
              paymentType: "card",
              installmentCount: 0,
              currency: "TL",
            }
          : { ok: false },
      );

    const res = await service.verifyPaymentFromClient("pay-1", {
      internal: true,
    });

    expect(res).toEqual({ completed: true, status: "completed_now" });
    // Her iki oid de sorgulandı; capture oid1'de bulundu.
    expect(queryPaymentStatus).toHaveBeenCalledWith("oid2");
    expect(queryPaymentStatus).toHaveBeenCalledWith("oid1");
    // processSuccessfulPayment is called with the captured oid (oid1) and
    // the inquiry's payment method, like the callback path.
    expect(processSuccessfulPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("oid1"),
      "oid1",
      { paymentType: "card", installmentCount: 0, currency: "TL" },
    );
  });

  it("hiçbir oid'de capture yok: paytr_not_found, tamamlanmaz", async () => {
    const { service, processSuccessfulPayment } = makeService(() => ({
      ok: false,
    }));

    const res = await service.verifyPaymentFromClient("pay-1", {
      internal: true,
    });

    expect(res.completed).toBe(false);
    expect(res.status).toBe("paytr_not_found");
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it("capture var ama tutar uyuşmuyor: amount_mismatch, tamamlanmaz", async () => {
    const { service, processSuccessfulPayment } = makeService((oid) =>
      oid === "oid1"
        ? { ok: true, paymentTotalTl: 999, paymentDate: "2026-01-01" }
        : { ok: false },
    );

    const res = await service.verifyPaymentFromClient("pay-1", {
      internal: true,
    });

    expect(res.completed).toBe(false);
    expect(res.status).toBe("amount_mismatch");
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
  });

  describe("installment oids (ADR 0019, PSP scale)", () => {
    // oid1 was signed for 3 installments: PayTR charged C = 106.64, T = 100.
    const attempts = [
      { merchantOid: "oid1", chargedAmount: new Prisma.Decimal("106.64") },
      { merchantOid: "oid2", chargedAmount: new Prisma.Decimal("100.00") },
    ];
    const paidAt = (paymentTotalTl: number) => (oid: string) =>
      oid === "oid1"
        ? {
            ok: true,
            paymentTotalTl,
            paymentDate: "2026-11-06",
            paymentType: "card",
            installmentCount: 3,
            currency: "TL",
          }
        : { ok: false };

    it("finds an installment form paid at its C, so the next form is never charged again", async () => {
      const { service, processSuccessfulPayment } = makeService(
        paidAt(106.64),
        ["oid2", "oid1"],
        PaytrMerchant.marketplace,
        attempts,
      );

      const res = await service.verifyPaymentFromClient("pay-1", {
        internal: true,
      });

      expect(res).toEqual({ completed: true, status: "completed_now" });
      expect(processSuccessfulPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("oid1"),
        "oid1",
        { paymentType: "card", installmentCount: 3, currency: "TL" },
      );
    });

    it("does not complete an installment oid PayTR reports at T", async () => {
      const { service, processSuccessfulPayment } = makeService(
        paidAt(100),
        ["oid2", "oid1"],
        PaytrMerchant.marketplace,
        attempts,
      );

      const res = await service.verifyPaymentFromClient("pay-1", {
        internal: true,
      });

      expect(res).toEqual({ completed: false, status: "amount_mismatch" });
      expect(processSuccessfulPayment).not.toHaveBeenCalled();
    });
  });
});
