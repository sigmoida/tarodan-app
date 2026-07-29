import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PaymentStatus } from "@prisma/client";

/**
 * SEC-H1: bypass-complete üç katmanlı kilit — production'da SERT ret (PAYMENT_BYPASS
 * yanlışlıkla açık olsa bile), + ownership.
 * SEC-M1: confirm-failed (public, idempotent) CANLI 3DS çekimini fail etmez (orphan capture).
 */
describe("Payment security — SEC-H1 bypass + SEC-M1 confirm-failed", () => {
  describe("SEC-H1 bypassCompletePayment", () => {
    const OWNER = "buyer-1";
    const origEnv = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = origEnv;
    });

    const makeService = (bypass: string) => {
      const payment = {
        id: "pay-1",
        status: PaymentStatus.pending,
        orderId: "o1",
        order: { buyerId: OWNER, buyer: {}, seller: {}, product: {} },
        checkoutGroup: null,
        tradeCashPayment: null,
      };
      const prisma = {
        payment: { findUnique: jest.fn().mockResolvedValue(payment) },
      };
      const configService = {
        get: jest.fn((k: string) =>
          k === "PAYMENT_BYPASS" ? bypass : undefined,
        ),
      };
      const processSuccessfulPayment = jest.fn().mockResolvedValue(true);
      const service = new PaymentInitiationService(
        prisma as any,
        configService as any,
        {} as any, // paymentProviders
        {} as any, // productLockService
        {} as any, // paymentCommon
        { processSuccessfulPayment } as any, // paymentFulfillment
        {} as any, // paymentLifecycle
        { record: jest.fn() } as any, // providerEvents
      );
      return { service, processSuccessfulPayment };
    };

    it("production'da PAYMENT_BYPASS açık olsa bile SERT reddedilir", async () => {
      process.env.NODE_ENV = "production";
      const { service, processSuccessfulPayment } = makeService("true");

      await expect(
        service.bypassCompletePayment("pay-1", OWNER),
      ).rejects.toThrow();
      expect(processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it("non-production + sahip değil → reddedilir", async () => {
      process.env.NODE_ENV = "test";
      const { service, processSuccessfulPayment } = makeService("true");

      await expect(
        service.bypassCompletePayment("pay-1", "someone-else"),
      ).rejects.toThrow();
      expect(processSuccessfulPayment).not.toHaveBeenCalled();
    });

    it("non-production + sahip + bypass açık → tamamlar", async () => {
      process.env.NODE_ENV = "test";
      const { service, processSuccessfulPayment } = makeService("true");

      const res = await service.bypassCompletePayment("pay-1", OWNER);

      expect(res.success).toBe(true);
      expect(processSuccessfulPayment).toHaveBeenCalled();
    });

    it("bypass kapalı → reddedilir (sahip olsa bile)", async () => {
      process.env.NODE_ENV = "test";
      const { service, processSuccessfulPayment } = makeService("false");

      await expect(
        service.bypassCompletePayment("pay-1", OWNER),
      ).rejects.toThrow();
      expect(processSuccessfulPayment).not.toHaveBeenCalled();
    });
  });

  describe("SEC-M1 confirmFailedFromClient", () => {
    const makeService = (
      isLive: boolean,
      status: PaymentStatus = PaymentStatus.pending,
    ) => {
      const prisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            id: "pay-1",
            status,
            metadata: {},
            order: { id: "o1" },
          }),
        },
      };
      const configService = {
        get: jest.fn(() => "35"),
      };
      const paymentCommon = {
        isChargeLikelyLive: jest.fn().mockReturnValue(isLive),
      };
      const processFailedPayment = jest.fn().mockResolvedValue(undefined);
      const service = new PaymentLifecycleService(
        prisma as any,
        configService as any,
        {} as any, // paymentProviders
        {} as any, // eventService
        paymentCommon as any,
        { processFailedPayment } as any, // paymentFulfillment
      );
      return { service, processFailedPayment };
    };

    it("CANLI 3DS çekimi varken fail ETMEZ (orphan capture koruması)", async () => {
      const { service, processFailedPayment } = makeService(true);

      const res = await service.confirmFailedFromClient("pay-1", {
        internal: true,
      });

      expect(res.released).toBe(false);
      expect(processFailedPayment).not.toHaveBeenCalled();
    });

    it("canlı çekim yoksa fail eder ve rezervasyonu bırakır", async () => {
      const { service, processFailedPayment } = makeService(false);

      const res = await service.confirmFailedFromClient("pay-1", {
        internal: true,
      });

      expect(res.released).toBe(true);
      expect(processFailedPayment).toHaveBeenCalled();
    });

    it("ödeme pending değilse no-op", async () => {
      const { service, processFailedPayment } = makeService(
        false,
        PaymentStatus.completed,
      );

      const res = await service.confirmFailedFromClient("pay-1", {
        internal: true,
      });

      expect(res.released).toBe(false);
      expect(processFailedPayment).not.toHaveBeenCalled();
    });
  });
});
