import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { PaymentStatus } from "@prisma/client";

/**
 * FLOW-H2: cancelExpiredPayments artık fail penceresini son 3DS charge-start'ından
 * (metadata.lastChargeStartedAt) sayar. Kullanıcı initiate'ten çok sonra 3DS'e girse
 * bile (createdAt eski, charge yeni) canlı oturum `failed` YAPILMAZ → orphan capture yok.
 */
describe("PaymentReconciliationService.cancelExpiredPayments — FLOW-H2 live 3DS guard", () => {
  const makeService = (candidate: any) => {
    const prisma = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([candidate]),
      },
    };
    const configService = {
      get: jest.fn((k: string) =>
        k === "PAYMENT_FAIL_TIMEOUT_MINUTES" ? "35" : undefined,
      ),
    };
    const service = new PaymentReconciliationService(
      prisma as any, // prisma
      {} as any, // cache
      configService as any, // configService
      {} as any, // paymentProviders
      {} as any, // invoiceService
      {} as any, // notificationService
      {} as any, // commissionLedger
      {} as any, // paymentRefund
      {} as any, // eventService
      {} as any, // paymentCommon
      {} as any, // paymentFulfillment
    );
    return { service, prisma };
  };

  const candidate = (lastChargeStartedAt: string | undefined) => ({
    id: "pay-1",
    orderId: "order-1",
    metadata: lastChargeStartedAt ? { lastChargeStartedAt } : {},
    order: {
      status: "pending_payment",
      orderNumber: "ORD1",
      paymentExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      buyer: { id: "b1", email: "b@x", displayName: "B" },
    },
    checkoutGroup: null,
  });

  const failedClaimCalls = (updateMany: jest.Mock) =>
    updateMany.mock.calls.filter(
      ([arg]: [any]) => arg?.data?.status === PaymentStatus.failed,
    );

  it("canlı 3DS (charge-start yakın): payment `failed` YAPILMAZ", async () => {
    const { service, prisma } = makeService(
      candidate(new Date().toISOString()),
    );

    await service.cancelExpiredPayments();

    // failed'a çeviren updateMany (CAS failedClaim) hiç çağrılmamalı.
    expect(failedClaimCalls(prisma.payment.updateMany)).toHaveLength(0);
  });

  it("eski charge-start (pencere kapandı): payment `failed` YAPILIR", async () => {
    const { service, prisma } = makeService(
      candidate(new Date(Date.now() - 60 * 60 * 1000).toISOString()),
    );

    await service.cancelExpiredPayments();

    expect(
      failedClaimCalls(prisma.payment.updateMany).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("charge-start damgası yok (eski satır): eski davranış — `failed` YAPILIR", async () => {
    const { service, prisma } = makeService(candidate(undefined));

    await service.cancelExpiredPayments();

    expect(
      failedClaimCalls(prisma.payment.updateMany).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
