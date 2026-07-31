import { createHash } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  REFERENCE_PREFIX,
  reprefixReference,
} from "../src/common/helpers/code-prefixes";

const money = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const numeric = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface SeedOrderFinancialInput {
  orderNumber: string;
  productId: string;
  quantity?: number | null;
  unitPrice?: unknown;
  subtotal?: unknown;
  totalAmount: unknown;
  shippingCost?: unknown;
  buyerShippingAmount?: unknown;
  sellerShippingAmount?: unknown;
  commissionAmount?: unknown;
  buyerFeeAmount?: unknown;
  sellerFeeAmount?: unknown;
  buyerCommissionAmount?: unknown;
  buyerServiceFeeAmount?: unknown;
  sellerCommissionAmount?: unknown;
  sellerPlatformFeeAmount?: unknown;
  discountAmount?: unknown;
  discountCode?: string | null;
  platformFundedDiscount?: unknown;
  taxAmount?: unknown;
  withholdingTaxAmount?: unknown;
  tariffId: string;
  tariffVersion: number;
}

export function buildSeedOrderFinancialState(input: SeedOrderFinancialInput): {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  buyerShippingAmount: number;
  sellerShippingAmount: number;
  fullShippingAmount: number;
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  buyerCommissionAmount: number;
  buyerServiceFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  financialSnapshot: Prisma.InputJsonObject;
} {
  const quantity = Math.max(1, Math.floor(numeric(input.quantity) || 1));
  const totalAmount = money(numeric(input.totalAmount));
  const shippingCost = money(numeric(input.shippingCost));
  const taxAmount = money(numeric(input.taxAmount));
  const buyerFeeAmount = money(numeric(input.buyerFeeAmount));
  const commissionAmount = money(numeric(input.commissionAmount));
  const explicitFeeSplit = [
    input.buyerFeeAmount,
    input.sellerFeeAmount,
    input.buyerCommissionAmount,
    input.buyerServiceFeeAmount,
    input.sellerCommissionAmount,
    input.sellerPlatformFeeAmount,
  ].some((value) => numeric(value) !== 0);
  const sellerFeeAmount = money(
    explicitFeeSplit ? numeric(input.sellerFeeAmount) : commissionAmount,
  );
  const buyerCommissionAmount = money(numeric(input.buyerCommissionAmount));
  const buyerServiceFeeAmount = money(
    numeric(input.buyerServiceFeeAmount) ||
      buyerFeeAmount - buyerCommissionAmount,
  );
  const sellerCommissionAmount = money(
    numeric(input.sellerCommissionAmount) ||
      sellerFeeAmount - numeric(input.sellerPlatformFeeAmount),
  );
  const sellerPlatformFeeAmount = money(numeric(input.sellerPlatformFeeAmount));
  const hasShippingSplit =
    numeric(input.buyerShippingAmount) !== 0 ||
    numeric(input.sellerShippingAmount) !== 0;
  const buyerShippingAmount = money(
    hasShippingSplit ? numeric(input.buyerShippingAmount) : shippingCost,
  );
  const sellerShippingAmount = money(numeric(input.sellerShippingAmount));
  const fullShippingAmount = money(buyerShippingAmount + sellerShippingAmount);
  const subtotal = money(
    numeric(input.subtotal) ||
      Math.max(
        0,
        totalAmount - buyerShippingAmount - buyerFeeAmount - taxAmount,
      ),
  );
  const unitPrice = money(numeric(input.unitPrice) || subtotal / quantity);
  const discountAmount = money(numeric(input.discountAmount));
  const platformFundedDiscount = money(numeric(input.platformFundedDiscount));
  const withholdingTaxAmount = money(numeric(input.withholdingTaxAmount));
  const pricingHash = createHash("sha256")
    .update(`seed|${input.orderNumber}|${input.productId}|${totalAmount}`)
    .digest("hex");

  return {
    quantity,
    unitPrice,
    subtotal,
    buyerShippingAmount,
    sellerShippingAmount,
    fullShippingAmount,
    buyerFeeAmount,
    sellerFeeAmount,
    buyerCommissionAmount,
    buyerServiceFeeAmount,
    sellerCommissionAmount,
    sellerPlatformFeeAmount,
    financialSnapshot: {
      version: 1,
      confirmedAt: new Date().toISOString(),
      pricing: {
        hash: pricingHash,
        productId: input.productId,
        quantity,
        unitPrice,
        originalUnitPrice: money(
          unitPrice + (discountAmount > 0 ? discountAmount / quantity : 0),
        ),
        subtotal,
        discountAmount,
        totalAmount,
      },
      discount: {
        code: input.discountCode ?? null,
        amount: discountAmount,
        platformFundedAmount: platformFundedDiscount,
      },
      shipping: {
        tariffId: input.tariffId,
        tariffVersion: input.tariffVersion,
        fullAmount: fullShippingAmount,
        buyerAmount: buyerShippingAmount,
        sellerAmount: sellerShippingAmount,
      },
      commission: {
        ruleId: null,
        ruleName: "Seed commerce normalization",
        ruleType: null,
        effectiveMembershipTier: null,
        taxpayerType: null,
        buyerFeeAmount,
        sellerFeeAmount,
        buyerCommissionAmount,
        buyerServiceFeeAmount,
        sellerCommissionAmount,
        sellerPlatformFeeAmount,
      },
      tax: {
        amount: taxAmount,
        withholdingAmount: withholdingTaxAmount,
      },
    },
  };
}

function isPhysicalProductId(productId: string): boolean {
  return (
    !productId.startsWith("membership-") && !productId.startsWith("boost-")
  );
}

export async function normalizeSeedCommerce(
  prisma: PrismaClient,
): Promise<{ orders: number; groups: number; packages: number }> {
  const tariff = await prisma.shippingTariff.findFirst({
    where: { status: "active" },
    orderBy: { version: "desc" },
  });
  if (!tariff) {
    throw new Error(
      "Seed commerce normalization requires an active shipping tariff.",
    );
  }

  const initialOrders = await prisma.order.findMany({
    include: {
      checkoutGroup: true,
      payment: true,
      product: { select: { shippingDesi: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const physicalOrders = initialOrders.filter((order) =>
    isPhysicalProductId(order.productId),
  );
  let createdGroups = 0;

  for (const order of physicalOrders) {
    let checkoutGroupId = order.checkoutGroupId;
    if (!checkoutGroupId) {
      // Runtime ile aynı türetim: ORD-K7X9M2QF3N → GRP-K7X9M2QF3N.
      const groupNumber = reprefixReference(
        order.orderNumber,
        REFERENCE_PREFIX.checkoutGroup,
      );
      const group = await prisma.checkoutGroup.upsert({
        where: { groupNumber },
        update: {
          buyerId: order.buyerId,
          totalAmount: order.totalAmount,
        },
        create: {
          groupNumber,
          buyerId: order.buyerId,
          totalAmount: order.totalAmount,
          isGuest: false,
          createdAt: order.createdAt,
        },
      });
      checkoutGroupId = group.id;
      createdGroups += 1;
      await prisma.order.update({
        where: { id: order.id },
        data: { checkoutGroupId },
      });
    }

    if (order.payment?.orderId) {
      const existingGroupPayment = await prisma.payment.findUnique({
        where: { checkoutGroupId },
      });
      if (
        existingGroupPayment &&
        existingGroupPayment.id !== order.payment.id
      ) {
        throw new Error(
          `Checkout group ${checkoutGroupId} has conflicting seed payments.`,
        );
      }
      await prisma.payment.update({
        where: { id: order.payment.id },
        data: { orderId: null, checkoutGroupId },
      });
    }
  }

  const orders = await prisma.order.findMany({
    where: {
      id: { in: physicalOrders.map((order) => order.id) },
    },
    include: {
      package: true,
      product: { select: { shippingDesi: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const packageBuckets = new Map<string, typeof orders>();
  for (const order of orders) {
    if (!order.checkoutGroupId) continue;
    const key = `${order.checkoutGroupId}:${order.sellerId}`;
    const bucket = packageBuckets.get(key);
    if (bucket) bucket.push(order);
    else packageBuckets.set(key, [order]);
  }

  let createdPackages = 0;
  for (const members of packageBuckets.values()) {
    const head = members[0];
    const checkoutGroupId = head.checkoutGroupId as string;
    const states = members.map((order) =>
      buildSeedOrderFinancialState({
        ...order,
        tariffId: tariff.id,
        tariffVersion: tariff.version,
      }),
    );
    const buyerShippingAmount = money(
      states.reduce((sum, state) => sum + state.buyerShippingAmount, 0),
    );
    const sellerShippingAmount = money(
      states.reduce((sum, state) => sum + state.sellerShippingAmount, 0),
    );
    const fullShippingAmount = money(
      buyerShippingAmount + sellerShippingAmount,
    );
    const billableDesi = members.reduce(
      (sum, order) =>
        sum +
        Math.max(1, order.product.shippingDesi) *
          Math.max(1, order.quantity ?? 1),
      0,
    );
    let packageId = members.find((order) => order.packageId)?.packageId ?? null;

    if (!packageId) {
      const orderPackage = await prisma.orderPackage.create({
        data: {
          checkoutGroupId,
          sellerId: head.sellerId,
          buyerId: head.buyerId,
          shippingCost: buyerShippingAmount,
          shippingTariffId: tariff.id,
          shippingTariffVersion: tariff.version,
          fullShippingAmount,
          buyerShippingAmount,
          sellerShippingAmount,
          billableDesi,
          shippingPricingSnapshot: {
            provider: tariff.provider,
            tariffId: tariff.id,
            tariffVersion: tariff.version,
            billableDesi,
            fullShippingAmount,
          },
          createdAt: head.createdAt,
        },
      });
      packageId = orderPackage.id;
      createdPackages += 1;
    } else {
      await prisma.orderPackage.update({
        where: { id: packageId },
        data: {
          checkoutGroupId,
          sellerId: head.sellerId,
          buyerId: head.buyerId,
          shippingCost: buyerShippingAmount,
          shippingTariffId: tariff.id,
          shippingTariffVersion: tariff.version,
          fullShippingAmount,
          buyerShippingAmount,
          sellerShippingAmount,
          billableDesi,
          shippingPricingSnapshot: {
            provider: tariff.provider,
            tariffId: tariff.id,
            tariffVersion: tariff.version,
            billableDesi,
            fullShippingAmount,
          },
        },
      });
    }

    for (let index = 0; index < members.length; index += 1) {
      const order = members[index];
      const state = states[index];
      await prisma.order.update({
        where: { id: order.id },
        data: {
          packageId,
          quantity: state.quantity,
          unitPrice: state.unitPrice,
          subtotal: state.subtotal,
          buyerShippingAmount: state.buyerShippingAmount,
          sellerShippingAmount: state.sellerShippingAmount,
          buyerFeeAmount: state.buyerFeeAmount,
          sellerFeeAmount: state.sellerFeeAmount,
          buyerCommissionAmount: state.buyerCommissionAmount,
          buyerServiceFeeAmount: state.buyerServiceFeeAmount,
          sellerCommissionAmount: state.sellerCommissionAmount,
          sellerPlatformFeeAmount: state.sellerPlatformFeeAmount,
          financialSnapshot: state.financialSnapshot,
        },
      });
    }
  }

  const groupIds = Array.from(
    new Set(
      orders
        .map((order) => order.checkoutGroupId)
        .filter((id): id is string => !!id),
    ),
  );
  for (const groupId of groupIds) {
    const aggregate = await prisma.order.aggregate({
      where: { checkoutGroupId: groupId },
      _sum: { totalAmount: true },
    });
    await prisma.checkoutGroup.update({
      where: { id: groupId },
      data: { totalAmount: aggregate._sum.totalAmount ?? 0 },
    });
  }

  return {
    orders: orders.length,
    groups: createdGroups,
    packages: createdPackages,
  };
}
