import { Prisma } from "@prisma/client";
import { PaymentQueryService } from "./payment-query.service";

/**
 * Installment fields in the payer's own payment views (ADR 0019, plan 5.2):
 * `GET /payments/:id/status` and `GET /payments/my-payments` add
 * `installmentCount`, `installmentFeeAmount`, `chargedAmount`, `cardFamily`
 * and `cardBank`. The seller, who may read the same payment, gets none of
 * them: the card and the fee are the buyer's. Additive: `amount` stays T.
 */
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const BUYER = "buyer-1";
const SELLER = "seller-1";

const captured = {
  id: "pay-1",
  orderId: "order-1",
  status: "completed",
  amount: D("1000.00"),
  chargedAmount: D("1066.38"),
  installmentCount: 3,
  chargeAttempt: { cardFamily: "world", cardBank: "Test Bank" },
  currency: "TRY",
  provider: "paytr",
  providerPaymentId: null,
  providerConversationId: "ORD1A",
  createdAt: new Date("2026-11-06T10:00:00Z"),
  updatedAt: new Date("2026-11-06T10:01:00Z"),
  paidAt: new Date("2026-11-06T10:01:00Z"),
  failureReason: null,
  order: {
    buyerId: BUYER,
    sellerId: SELLER,
    productId: "prod-1",
    totalAmount: D("1000.00"),
    shippingCost: D("0"),
    buyerFeeAmount: D("0"),
    sellerFeeAmount: D("0"),
    commissionAmount: D("100.00"),
  },
  checkoutGroup: null,
  tradeCashPayment: null,
};

const FIELDS = {
  installmentCount: 3,
  installmentFeeAmount: 66.38,
  chargedAmount: 1066.38,
  cardFamily: "world",
  cardBank: "Test Bank",
};

function service(payment: unknown, list: unknown[] = []) {
  const prisma = {
    payment: {
      findUnique: jest.fn().mockResolvedValue(payment),
      findMany: jest.fn().mockResolvedValue(list),
      count: jest.fn().mockResolvedValue(list.length),
    },
    productBoost: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const i18n = { translate: jest.fn((key: string) => key) };
  return {
    svc: new PaymentQueryService(
      prisma as never,
      { getPublicAssetUrl: jest.fn() } as never,
      i18n as never,
    ),
    prisma,
  };
}

describe("payment installment fields", () => {
  describe("GET /payments/:id/status", () => {
    it("shows the buyer the count, fee, charged amount and card", async () => {
      const { svc, prisma } = service(captured);
      const status = await svc.getPaymentStatusUnified("pay-1", BUYER);
      expect(status).toMatchObject({ amount: 1000, ...FIELDS });
      expect(prisma.payment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            chargeAttempt: { select: { cardFamily: true, cardBank: true } },
          }),
        }),
      );
    });

    it("shows a guest holding the payment capability the same", async () => {
      const { svc } = service(captured);
      const status = await svc.getPaymentStatusUnified("pay-1", null, true);
      expect(status).toMatchObject(FIELDS);
    });

    it("never shows the seller the buyer's card or fee", async () => {
      const { svc } = service(captured);
      const status = await svc.getPaymentStatusUnified("pay-1", SELLER);
      for (const field of Object.keys(FIELDS)) {
        expect(status).not.toHaveProperty(field);
      }
      expect(status).toMatchObject({ amount: 1000 });
    });
  });

  describe("GET /payments/my-payments", () => {
    it("adds the fields to the payer's own rows only", async () => {
      const { svc } = service(null, [
        { ...captured, order: { ...captured.order, product: null } },
      ]);
      const asBuyer = await svc.getUserPayments(BUYER);
      expect(asBuyer.payments[0]).toMatchObject({ amount: 1000, ...FIELDS });

      const asSeller = await svc.getUserPayments(SELLER);
      for (const field of Object.keys(FIELDS)) {
        expect(asSeller.payments[0]).not.toHaveProperty(field);
      }
    });

    it("shows a legacy single payment as one installment of its amount", async () => {
      const { svc } = service(null, [
        {
          ...captured,
          chargedAmount: null,
          installmentCount: 1,
          chargeAttempt: null,
          order: { ...captured.order, product: null },
        },
      ]);
      const result = await svc.getUserPayments(BUYER);
      expect(result.payments[0]).toMatchObject({
        installmentCount: 1,
        installmentFeeAmount: 0,
        chargedAmount: 1000,
      });
      expect(result.payments[0]).not.toHaveProperty("cardFamily");
    });
  });
});
