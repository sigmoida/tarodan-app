import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../test-utils/db";

/**
 * Data-layer factories for the installment tables (ADR 0019): rows written
 * straight through Prisma, no app boot. Amounts follow the plan's worked
 * example (1,000.00 TL cart, 3 installments, default rule, k = 1/6:
 * F = 66.38, C = 1,066.38).
 */

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

/**
 * A pending cart (checkout group) payment of `amount` TL, with its buyer.
 * `testLane` makes the buyer a test-lane account, so the DB trigger stamps
 * the payment `is_test`.
 */
export async function createGroupPayment(
  opts: { amount?: string; testLane?: boolean } = {},
): Promise<{ paymentId: string; buyerId: string; groupId: string }> {
  const prisma = getPrisma();
  const amount = new Prisma.Decimal(opts.amount ?? "1000.00");
  const buyer = await prisma.user.create({
    data: {
      email: `installment-${unique()}@test.local`,
      passwordHash: "not-a-real-hash",
      displayName: "Installment Buyer",
      isTestAccount: opts.testLane ?? false,
    },
  });
  const group = await prisma.checkoutGroup.create({
    data: {
      groupNumber: `TG-${unique()}`,
      buyerId: buyer.id,
      totalAmount: amount,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      checkoutGroupId: group.id,
      provider: "paytr",
      amount,
    },
  });
  return { paymentId: payment.id, buyerId: buyer.id, groupId: group.id };
}

/**
 * A minimal order of the cart behind `createGroupPayment` (seller, category
 * and listing created on the fly). Refund attempts need an order target.
 */
export async function createGroupOrder(
  payment: { buyerId: string; groupId: string },
  opts: { totalAmount?: string } = {},
): Promise<{ orderId: string }> {
  const prisma = getPrisma();
  const seller = await prisma.user.create({
    data: {
      email: `installment-seller-${unique()}@test.local`,
      passwordHash: "not-a-real-hash",
      displayName: "Installment Seller",
      isSeller: true,
    },
  });
  const key = unique();
  const category = await prisma.category.create({
    data: { name: `Installment Test ${key}`, slug: `installment-test-${key}` },
  });
  const product = await prisma.product.create({
    data: {
      sellerId: seller.id,
      categoryId: category.id,
      title: "Installment test model car",
      price: new Prisma.Decimal(opts.totalAmount ?? "1000.00"),
      condition: "new",
    },
  });
  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-INST-${unique()}`,
      buyerId: payment.buyerId,
      sellerId: seller.id,
      productId: product.id,
      checkoutGroupId: payment.groupId,
      totalAmount: new Prisma.Decimal(opts.totalAmount ?? "1000.00"),
      commissionAmount: new Prisma.Decimal("0"),
      paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return { orderId: order.id };
}

export async function createRateSnapshot(
  overrides: Partial<Prisma.InstallmentRateSnapshotUncheckedCreateInput> = {},
) {
  return getPrisma().installmentRateSnapshot.create({
    data: {
      paytrMerchant: "marketplace",
      fetchedAt: new Date(),
      maxInstallmentNonBusiness: 12,
      singleRatePct: new Prisma.Decimal("3.000"),
      rates: { world: { "3": 8, "6": 13 } },
      raw: { status: "success" },
      ...overrides,
    },
  });
}

/** Version 1 of a new rule (its id is its lineage id). */
export async function createInstallmentRule(
  overrides: Partial<Prisma.InstallmentRuleUncheckedCreateInput> = {},
) {
  const id = overrides.id ?? randomUUID();
  return getPrisma().installmentRule.create({
    data: {
      id,
      lineageId: id,
      version: 1,
      name: "Premium 3 taksit vade farksız",
      segment: "premium",
      minCount: 2,
      maxCount: 3,
      platformSharePct: new Prisma.Decimal("100.00"),
      validFrom: new Date("2026-11-01T00:00:00Z"),
      createdBy: "admin-test",
      ...overrides,
    },
  });
}

/**
 * A 3-installment attempt priced from `rateSnapshotId` with the default
 * rule (buyer pays all). Pass `installmentCount: 1` with zero fee and no
 * snapshot for a single-payment attempt.
 */
export async function createChargeAttempt(
  paymentId: string,
  rateSnapshotId: string | null,
  overrides: Partial<Prisma.PaymentChargeAttemptUncheckedCreateInput> = {},
) {
  return getPrisma().paymentChargeAttempt.create({
    data: {
      paymentId,
      merchantOid: `TG${unique()}`,
      paytrMerchant: "marketplace",
      installmentCount: 3,
      baseAmount: new Prisma.Decimal("1000.00"),
      installmentFeeAmount: new Prisma.Decimal("66.38"),
      chargedAmount: new Prisma.Decimal("1066.38"),
      singleRatePct: new Prisma.Decimal("3.000"),
      installmentRatePct: new Prisma.Decimal("8.000"),
      feeVatRatePct: new Prisma.Decimal("20.00"),
      buyerSegment: "free",
      cardFamily: "world",
      cardBank: "Test Bank",
      cardType: "credit",
      businessCard: false,
      rateSnapshotId,
      ...overrides,
    },
  });
}
