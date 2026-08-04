import { createHash } from "crypto";
import {
  CommissionLedgerStatus,
  CommissionRuleSetStatus,
  OrderStatus,
  Prisma,
  PrismaClient,
  ProductKind,
} from "@prisma/client";
import {
  REFERENCE_PREFIX,
  reprefixReference,
} from "../src/common/helpers/code-prefixes";
import { generateReferenceCode } from "../src/common/helpers/generate-reference";
import {
  calculateCommissionFromRules,
  resolveCommissionSellerType,
} from "../src/modules/order/order-commission.helper";
import { calculateServiceTax } from "../src/modules/order/order-service-tax.helper";
import { buyerTotalOf } from "../src/modules/order/order-total.helper";
import { sellerNetAmountOf } from "../src/modules/order/order-net.helper";
import { effectiveMembershipTierType } from "../src/modules/membership/membership.util";
import {
  calculatePackageDesi,
  resolvePackageShippingDecision,
} from "../src/modules/shipping/shipping-tariff.helper";

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
  const tariffWithTiers = await prisma.shippingTariff.findUniqueOrThrow({
    where: { id: tariff.id },
    include: { packageTiers: true },
  });
  const activeCommissionSet = await prisma.commissionRuleSet.findFirst({
    where: { status: CommissionRuleSetStatus.ACTIVE },
    include: { rules: { include: { shippingShares: true } } },
  });
  if (!activeCommissionSet) {
    throw new Error(
      "Seed commerce normalization requires an active commission set.",
    );
  }
  const serviceVatSetting = await prisma.platformSetting.findUnique({
    where: { settingKey: "service_vat_rate" },
  });
  const serviceVatRate = numeric(serviceVatSetting?.settingValue ?? 20);

  const initialOrders = await prisma.order.findMany({
    include: {
      checkoutGroup: true,
      payment: true,
      product: { select: { kind: true, shippingDesi: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const physicalOrders = initialOrders.filter(
    (order) => order.product.kind === ProductKind.listing,
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
      product: {
        select: {
          categoryId: true,
          shippingDesi: true,
          shippingPackageTier: true,
          price: true,
          oldPrice: true,
        },
      },
      seller: {
        select: {
          sellerType: true,
          businessStatus: true,
          companyName: true,
          taxId: true,
          membership: {
            select: {
              status: true,
              currentPeriodEnd: true,
              tier: { select: { type: true, isActive: true } },
            },
          },
        },
      },
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
    const baseStates = members.map((order) =>
      buildSeedOrderFinancialState({
        ...order,
        tariffId: tariff.id,
        tariffVersion: tariff.version,
      }),
    );
    const commissions = members.map((order, index) => {
      const effectiveTier = effectiveMembershipTierType(
        order.seller.membership,
        order.seller,
      );
      const commissionSellerType = resolveCommissionSellerType({
        userSellerType: order.seller.sellerType,
        membershipTier: effectiveTier,
        configuredMembershipTier: order.seller.membership?.tier.type,
        businessStatus: order.seller.businessStatus,
        companyName: order.seller.companyName,
        taxId: order.seller.taxId,
      });
      const base = baseStates[index];
      return {
        effectiveTier,
        result: calculateCommissionFromRules(
          base.subtotal,
          activeCommissionSet.rules,
          {
            categoryId: order.product.categoryId,
            sellerType: commissionSellerType,
            amount: base.unitPrice,
          },
        ),
      };
    });
    const billableDesi = calculatePackageDesi(
      members.map((order) => ({
        shippingDesi: order.product.shippingDesi,
        quantity: order.quantity ?? 1,
      })),
    );
    const shippingDecision = resolvePackageShippingDecision({
      tariff: tariffWithTiers,
      subtotal: money(
        baseStates.reduce((sum, state) => sum + state.subtotal, 0),
      ),
      billableDesi,
      lineShares: commissions.map(({ result }) => result.shippingBuyerShares),
    });
    const buyerShippingAmount = shippingDecision.buyer;
    const sellerShippingAmount = shippingDecision.seller;
    const fullShippingAmount = shippingDecision.fullShipping;
    let packageId = members.find((order) => order.packageId)?.packageId ?? null;

    if (!packageId) {
      const orderPackage = await prisma.orderPackage.create({
        data: {
          // Koli numarası (PKG-…): Sürat'a iletilen ve müşterinin sorguladığı kod.
          packageNumber: generateReferenceCode(REFERENCE_PREFIX.orderPackage),
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
            tierCode: shippingDecision.tierCode,
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
            tierCode: shippingDecision.tierCode,
            billableDesi,
            fullShippingAmount,
          },
        },
      });
    }

    for (let index = 0; index < members.length; index += 1) {
      const order = members[index];
      const base = baseStates[index];
      const { effectiveTier, result: commission } = commissions[index];
      const lineBuyerShipping = index === 0 ? buyerShippingAmount : 0;
      const lineSellerShipping = index === 0 ? sellerShippingAmount : 0;
      const { buyerServiceTaxAmount, sellerServiceTaxAmount } =
        calculateServiceTax(
          {
            buyerCommissionAmount: commission.buyerCommissionAmount,
            buyerServiceFeeAmount: commission.buyerServiceFeeAmount,
            sellerCommissionAmount: commission.sellerCommissionAmount,
            sellerPlatformFeeAmount: commission.sellerPlatformFeeAmount,
            buyerShippingAmount: lineBuyerShipping,
            sellerShippingAmount: lineSellerShipping,
          },
          serviceVatRate,
        );
      const isCorporate =
        order.seller.businessStatus === "approved" &&
        !!order.seller.companyName?.trim() &&
        !!order.seller.taxId?.trim();
      const withholdingTaxAmount = isCorporate
        ? money(base.subtotal * 0.01)
        : 0;
      const totalAmount = buyerTotalOf({
        subtotal: base.subtotal,
        buyerShippingAmount: lineBuyerShipping,
        buyerFeeAmount: commission.buyerFeeAmount,
        buyerServiceTaxAmount,
      });
      const sellerNetAmount = sellerNetAmountOf({
        subtotal: base.subtotal,
        productTaxAmount: 0,
        sellerFeeAmount: commission.sellerFeeAmount,
        withholdingTaxAmount,
        sellerShippingAmount: lineSellerShipping,
        sellerServiceTaxAmount,
      });
      const discountAmount = money(
        numeric(order.discountAmount) ||
          (order.product.oldPrice &&
          Math.abs(Number(order.product.price) - base.unitPrice) < 0.01
            ? (Number(order.product.oldPrice) - base.unitPrice) * base.quantity
            : 0),
      );
      const financialSnapshot: Prisma.InputJsonObject = {
        version: 2,
        confirmedAt: new Date().toISOString(),
        pricing: {
          hash: createHash("sha256")
            .update(
              `seed-v2|${order.orderNumber}|${order.productId}|${base.unitPrice}|${base.quantity}`,
            )
            .digest("hex"),
          productId: order.productId,
          quantity: base.quantity,
          unitPrice: base.unitPrice,
          originalUnitPrice: money(
            base.unitPrice +
              (discountAmount > 0 ? discountAmount / base.quantity : 0),
          ),
          subtotal: base.subtotal,
          discountAmount,
          totalAmount,
        },
        discount: {
          code: order.discountCode ?? null,
          amount: discountAmount,
          platformFundedAmount: numeric(order.platformFundedDiscount),
        },
        shipping: {
          tariffId: tariff.id,
          tariffVersion: tariff.version,
          tierCode: shippingDecision.tierCode,
          fullAmount: index === 0 ? fullShippingAmount : 0,
          buyerAmount: lineBuyerShipping,
          sellerAmount: lineSellerShipping,
        },
        commission: {
          ruleSetId: commission.ruleSetId,
          ruleId: commission.ruleId,
          ruleName: commission.ruleName,
          matchedCategoryId: commission.matchedCategoryId,
          matchedSellerType: commission.matchedSellerType,
          matchedAmount: commission.matchedAmount,
          effectiveMembershipTier: effectiveTier,
          taxpayerType: isCorporate ? "corporate" : "individual",
          buyerFeeAmount: commission.buyerFeeAmount,
          sellerFeeAmount: commission.sellerFeeAmount,
          buyerCommissionAmount: commission.buyerCommissionAmount,
          buyerServiceFeeAmount: commission.buyerServiceFeeAmount,
          sellerCommissionAmount: commission.sellerCommissionAmount,
          sellerPlatformFeeAmount: commission.sellerPlatformFeeAmount,
        },
        tax: {
          amount: 0,
          withholdingAmount: withholdingTaxAmount,
          buyerServiceAmount: buyerServiceTaxAmount,
          sellerServiceAmount: sellerServiceTaxAmount,
        },
        sellerNetAmount,
      };
      await prisma.order.update({
        where: { id: order.id },
        data: {
          packageId,
          quantity: base.quantity,
          unitPrice: base.unitPrice,
          subtotal: base.subtotal,
          totalAmount,
          shippingCost: lineBuyerShipping,
          buyerShippingAmount: lineBuyerShipping,
          sellerShippingAmount: lineSellerShipping,
          commissionAmount: commission.commissionAmount,
          buyerFeeAmount: commission.buyerFeeAmount,
          sellerFeeAmount: commission.sellerFeeAmount,
          buyerCommissionAmount: commission.buyerCommissionAmount,
          buyerServiceFeeAmount: commission.buyerServiceFeeAmount,
          sellerCommissionAmount: commission.sellerCommissionAmount,
          sellerPlatformFeeAmount: commission.sellerPlatformFeeAmount,
          discountAmount,
          taxAmount: 0,
          buyerServiceTaxAmount,
          sellerServiceTaxAmount,
          serviceVatRate,
          withholdingTaxAmount,
          financialSnapshot,
        },
      });

      if (order.status !== OrderStatus.pending_payment) {
        const isRefunded =
          order.status === OrderStatus.refunded ||
          order.status === OrderStatus.cancelled;
        const ledgerStatus = isRefunded
          ? CommissionLedgerStatus.refunded
          : order.status === OrderStatus.completed
            ? CommissionLedgerStatus.earned
            : CommissionLedgerStatus.pending;
        const ledgerData = {
          sellerCommission: commission.sellerFeeAmount,
          buyerFee: commission.buyerFeeAmount,
          totalPlatformRevenue: money(
            commission.sellerFeeAmount + commission.buyerFeeAmount,
          ),
          refundedSellerCommission: isRefunded ? commission.sellerFeeAmount : 0,
          refundedBuyerFee: isRefunded ? commission.buyerFeeAmount : 0,
          status: ledgerStatus,
          earnedAt:
            ledgerStatus === CommissionLedgerStatus.earned
              ? (order.completedAt ?? order.updatedAt)
              : null,
          refundedAt: isRefunded ? order.updatedAt : null,
        };
        await prisma.commissionLedger.upsert({
          where: { orderId: order.id },
          update: ledgerData,
          create: { orderId: order.id, ...ledgerData },
        });
      }

      const hold = await prisma.paymentHold.findFirst({
        where: { orderId: order.id },
      });
      if (hold) {
        await prisma.paymentHold.update({
          where: { id: hold.id },
          data: { amount: sellerNetAmount },
        });
        await prisma.payoutTransfer.updateMany({
          where: { paymentHoldId: hold.id },
          data: {
            amount: totalAmount,
            commission: money(
              commission.sellerFeeAmount + commission.buyerFeeAmount,
            ),
            withholdingTax: withholdingTaxAmount,
            netAmount: sellerNetAmount,
          },
        });
        await prisma.payoutTransfer.updateMany({
          where: { paymentHoldId: hold.id, submittedAt: { not: null } },
          data: { submittedAmount: sellerNetAmount },
        });
      }

      await prisma.invoice.updateMany({
        where: { orderId: order.id },
        data: {
          subtotal: base.subtotal,
          taxAmount: 0,
          shippingCost: lineBuyerShipping,
          total: totalAmount,
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
    await prisma.payment.updateMany({
      where: { checkoutGroupId: groupId },
      data: { amount: aggregate._sum.totalAmount ?? 0 },
    });
  }

  return {
    orders: orders.length,
    groups: createdGroups,
    packages: createdPackages,
  };
}
