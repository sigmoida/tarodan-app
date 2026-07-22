import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PaymentStatus } from "@prisma/client";

/**
 * FLOW-H1: verifyPaymentFromClient (çift-çekim guard'ı) artık TÜM oid'leri tarar
 * (güncel providerConversationId + merchantOidHistory). Re-init sonrası capture ESKİ
 * oid'de olmuş olabilir; yalnız güncel oid'i sormak bunu kaçırıp ikinci çekime yol açardı.
 */
describe("PaymentLifecycleService.verifyPaymentFromClient — FLOW-H1 oid history scan", () => {
  const makeService = (
    queryImpl: (oid: string) => any,
    oids = ["oid2", "oid1"],
  ) => {
    const payment = {
      id: "pay-1",
      status: PaymentStatus.pending,
      provider: "paytr",
      providerConversationId: "oid2",
      metadata: { merchantOidHistory: ["oid1"] },
      amount: 100,
      order: { buyer: {}, seller: {}, product: {} },
      tradeCashPayment: null,
    };
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
    };
    const queryPaymentStatus = jest.fn(queryImpl);
    const paymentProviders = { resolve: () => ({ queryPaymentStatus }) };
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
    return { service, queryPaymentStatus, processSuccessfulPayment };
  };

  it("capture ESKİ oid'de (history): güncel oid boş dönse bile yakalanır ve tamamlanır", async () => {
    const { service, queryPaymentStatus, processSuccessfulPayment } =
      makeService((oid) =>
        oid === "oid1"
          ? { ok: true, paymentTotalTl: 100, paymentDate: "2026-01-01" }
          : { ok: false },
      );

    const res = await service.verifyPaymentFromClient("pay-1");

    expect(res).toEqual({ completed: true, status: "completed_now" });
    // Her iki oid de sorgulandı; capture oid1'de bulundu.
    expect(queryPaymentStatus).toHaveBeenCalledWith("oid2");
    expect(queryPaymentStatus).toHaveBeenCalledWith("oid1");
    // processSuccessfulPayment çekilen oid (oid1) ile senkron çağrıldı.
    expect(processSuccessfulPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("oid1"),
      "oid1",
    );
  });

  it("hiçbir oid'de capture yok: paytr_not_found, tamamlanmaz", async () => {
    const { service, processSuccessfulPayment } = makeService(() => ({
      ok: false,
    }));

    const res = await service.verifyPaymentFromClient("pay-1");

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

    const res = await service.verifyPaymentFromClient("pay-1");

    expect(res.completed).toBe(false);
    expect(res.status).toBe("amount_mismatch");
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
  });
});
