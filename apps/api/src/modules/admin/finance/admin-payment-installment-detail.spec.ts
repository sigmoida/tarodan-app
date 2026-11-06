import { Prisma } from "@prisma/client";
import { AdminPaymentService } from "./admin-payment.service";
import { ADMIN_PAYMENT_INSTALLMENT_INCLUDE } from "./admin-payment-installment-view";

/**
 * The installment block of `GET /admin/payments/:id` (ADR 0019, plan 6.4):
 * count, fee and charged amount from the payment, the pricing evidence from
 * its captured attempt (segment, rule version, share, expected platform
 * cost, card), every signed form read-only, and never the BIN.
 */
describe("AdminPaymentService.getPaymentById installment block", () => {
  const D = (value: string | number) => new Prisma.Decimal(value);

  const makeService = (row: Record<string, unknown>) => {
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(row) },
    };
    const svc = Object.create(AdminPaymentService.prototype);
    (svc as { prisma: unknown }).prisma = prisma;
    return { svc: svc as AdminPaymentService, prisma };
  };

  const basePayment = {
    id: "pay-1",
    orderId: "ord-1",
    order: null,
    checkoutGroup: null,
    tradeCashPayment: null,
    refundAttempts: [],
    paymentHolds: [],
    currency: "TRY",
    provider: "paytr",
    status: "completed",
    failureReason: null,
    providerPaymentId: null,
    providerConversationId: "TRDOID1",
    metadata: null,
    createdAt: new Date("2026-11-01T10:00:00.000Z"),
    updatedAt: new Date("2026-11-01T10:05:00.000Z"),
    paidAt: new Date("2026-11-01T10:05:00.000Z"),
  };

  it("reads a legacy single payment as one count at its goods amount, without pricing", async () => {
    const { svc } = makeService({
      ...basePayment,
      amount: D("500.00"),
      chargedAmount: null,
      installmentCount: 1,
      chargeAttempt: null,
      chargeAttempts: [],
    });

    const result = await svc.getPaymentById("pay-1");

    expect(result.installment).toEqual({
      installmentCount: 1,
      goodsAmount: 500,
      installmentFeeAmount: 0,
      chargedAmount: 500,
      pricing: null,
      chargeAttempts: [],
    });
  });

  it("returns the captured attempt's snapshot and every signed form, newest first", async () => {
    const { svc } = makeService({
      ...basePayment,
      amount: D("1000.00"),
      chargedAmount: D("1062.40"),
      installmentFeeAmount: D("62.40"),
      installmentCount: 3,
      chargeAttemptId: "att-2",
      chargeAttempt: {
        merchantOid: "TRDOID2",
        buyerSegment: "premium",
        platformSharePct: D("50.00"),
        platformCostAmount: D("31.20"),
        cardFamily: "world",
        cardBank: "Example Bank",
        cardType: "credit",
        businessCard: false,
        installmentRule: {
          id: "rule-v2",
          lineageId: "rule-v1",
          version: 2,
          name: "Premium 3 installments half price",
        },
        // A full row would carry these; the view must drop them.
        bin6: "123456",
        savedCardId: "card-1",
      },
      chargeAttempts: [
        {
          id: "att-2",
          merchantOid: "TRDOID2",
          installmentCount: 3,
          chargedAmount: D("1062.40"),
          installmentFeeAmount: D("62.40"),
          capturedAt: new Date("2026-11-01T10:05:00.000Z"),
          createdAt: new Date("2026-11-01T10:03:00.000Z"),
        },
        {
          id: "att-1",
          merchantOid: "TRDOID1",
          installmentCount: 1,
          chargedAmount: D("1000.00"),
          installmentFeeAmount: D("0.00"),
          capturedAt: null,
          createdAt: new Date("2026-11-01T10:00:00.000Z"),
        },
      ],
    });

    const result = await svc.getPaymentById("pay-1");

    expect(result.installment).toEqual({
      installmentCount: 3,
      goodsAmount: 1000,
      installmentFeeAmount: 62.4,
      chargedAmount: 1062.4,
      pricing: {
        merchantOid: "TRDOID2",
        buyerSegment: "premium",
        rule: {
          id: "rule-v2",
          lineageId: "rule-v1",
          version: 2,
          name: "Premium 3 installments half price",
        },
        platformSharePct: 50,
        platformCostAmount: 31.2,
        cardFamily: "world",
        cardBank: "Example Bank",
        cardType: "credit",
        businessCard: false,
      },
      chargeAttempts: [
        {
          id: "att-2",
          merchantOid: "TRDOID2",
          installmentCount: 3,
          chargedAmount: 1062.4,
          installmentFeeAmount: 62.4,
          capturedAt: "2026-11-01T10:05:00.000Z",
          applied: true,
          createdAt: "2026-11-01T10:03:00.000Z",
        },
        {
          id: "att-1",
          merchantOid: "TRDOID1",
          installmentCount: 1,
          chargedAmount: 1000,
          installmentFeeAmount: 0,
          capturedAt: null,
          applied: false,
          createdAt: "2026-11-01T10:00:00.000Z",
        },
      ],
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain("bin6");
    expect(json).not.toContain("123456");
    expect(json).not.toContain("savedCardId");
  });

  it("states the default (no rule) and an unknown card type as null", async () => {
    const { svc } = makeService({
      ...basePayment,
      amount: D("800.00"),
      chargedAmount: D("820.00"),
      installmentCount: 2,
      chargeAttempt: {
        merchantOid: "TRDOID1",
        buyerSegment: "guest",
        platformSharePct: D("0"),
        platformCostAmount: D("0"),
        cardFamily: null,
        cardBank: null,
        cardType: "prepaid",
        businessCard: null,
        installmentRule: null,
      },
      chargeAttempts: [],
    });

    const result = await svc.getPaymentById("pay-1");

    expect(result.installment.pricing).toMatchObject({
      buyerSegment: "guest",
      rule: null,
      platformSharePct: 0,
      platformCostAmount: 0,
      cardFamily: null,
      cardBank: null,
      cardType: null,
      businessCard: null,
    });
    expect(result.installment.installmentFeeAmount).toBe(20);
  });

  it("marks only the attempt the payment is booked from as applied, not a second captured charge", async () => {
    const attempt = (id: string) => ({
      id,
      merchantOid: `OID-${id}`,
      installmentCount: 1,
      chargedAmount: D("500.00"),
      installmentFeeAmount: D("0"),
      capturedAt: new Date("2026-11-01T10:05:00.000Z"),
      createdAt: new Date("2026-11-01T10:00:00.000Z"),
    });
    const { svc } = makeService({
      ...basePayment,
      amount: D("500.00"),
      chargedAmount: D("500.00"),
      installmentCount: 1,
      chargeAttemptId: "att-booked",
      chargeAttempt: null,
      chargeAttempts: [attempt("att-late"), attempt("att-booked")],
    });

    const result = await svc.getPaymentById("pay-1");

    expect(
      result.installment.chargeAttempts.map((a) => [a.id, a.applied]),
    ).toEqual([
      ["att-late", false],
      ["att-booked", true],
    ]);
  });

  it("selects the attempts explicitly (no BIN, no saved card) and narrows the order parties", async () => {
    const { svc, prisma } = makeService({
      ...basePayment,
      amount: D("500.00"),
      chargedAmount: null,
      installmentCount: 1,
      chargeAttempt: null,
      chargeAttempts: [],
    });

    await svc.getPaymentById("pay-1");

    const { include } = prisma.payment.findUnique.mock.calls[0][0];
    expect(include.chargeAttempt).toEqual(
      ADMIN_PAYMENT_INSTALLMENT_INCLUDE.chargeAttempt,
    );
    expect(include.chargeAttempts).toEqual(
      ADMIN_PAYMENT_INSTALLMENT_INCLUDE.chargeAttempts,
    );
    for (const select of [
      include.chargeAttempt.select,
      include.chargeAttempts.select,
    ]) {
      expect(select).not.toHaveProperty("bin6");
      expect(select).not.toHaveProperty("savedCardId");
    }
    expect(include.order.include.buyer).toEqual({
      select: { id: true, displayName: true, email: true },
    });
    expect(include.order.include.seller).toEqual({
      select: { id: true, displayName: true, email: true },
    });
  });
});
