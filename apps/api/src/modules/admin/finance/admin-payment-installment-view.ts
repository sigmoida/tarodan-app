import { Prisma } from "@prisma/client";
import type {
  AdminPaymentChargeAttempt,
  AdminPaymentInstallment,
  AdminPaymentInstallmentPricing,
  InstallmentSegment,
} from "@tarodan/types";
import { paymentInstallmentFieldsOf } from "../../payment/helpers/payment-installment-view";

/**
 * The installment block of `GET /admin/payments/:id` (ADR 0019, plan 6.4):
 * count, fee and charged amount of the payment, the pricing snapshot of its
 * captured charge attempt and every signed form, read-only. The selects are
 * explicit so the BIN (`bin6`) and the saved card never leave the API.
 */
export const ADMIN_PAYMENT_INSTALLMENT_INCLUDE = {
  chargeAttempt: {
    select: {
      merchantOid: true,
      buyerSegment: true,
      platformSharePct: true,
      platformCostAmount: true,
      cardFamily: true,
      cardBank: true,
      cardType: true,
      businessCard: true,
      installmentRule: {
        select: { id: true, lineageId: true, version: true, name: true },
      },
    },
  },
  chargeAttempts: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      merchantOid: true,
      installmentCount: true,
      chargedAmount: true,
      installmentFeeAmount: true,
      capturedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.PaymentInclude;

type AdminPaymentInstallmentRow = Prisma.PaymentGetPayload<{
  include: typeof ADMIN_PAYMENT_INSTALLMENT_INCLUDE;
}>;

/** What the mapper reads; the relations are optional for partial reads. */
export type AdminPaymentInstallmentSource = Pick<
  AdminPaymentInstallmentRow,
  "amount" | "chargedAmount" | "installmentCount" | "chargeAttemptId"
> & {
  chargeAttempt?: AdminPaymentInstallmentRow["chargeAttempt"];
  chargeAttempts?: AdminPaymentInstallmentRow["chargeAttempts"];
};

const toIso = (value: Date | string | null): string | null =>
  value == null ? null : new Date(value).toISOString();

function pricingOf(
  attempt: NonNullable<AdminPaymentInstallmentRow["chargeAttempt"]>,
): AdminPaymentInstallmentPricing {
  const rule = attempt.installmentRule;
  return {
    merchantOid: attempt.merchantOid,
    buyerSegment: attempt.buyerSegment as InstallmentSegment,
    rule: rule
      ? {
          id: rule.id,
          lineageId: rule.lineageId,
          version: rule.version,
          name: rule.name,
        }
      : null,
    platformSharePct: Number(attempt.platformSharePct),
    platformCostAmount: Number(attempt.platformCostAmount),
    cardFamily: attempt.cardFamily ?? null,
    cardBank: attempt.cardBank ?? null,
    cardType:
      attempt.cardType === "credit" || attempt.cardType === "debit"
        ? attempt.cardType
        : null,
    businessCard: attempt.businessCard ?? null,
  };
}

function attemptOf(
  attempt: AdminPaymentInstallmentRow["chargeAttempts"][number],
  appliedId: string | null,
): AdminPaymentChargeAttempt {
  return {
    id: attempt.id,
    merchantOid: attempt.merchantOid,
    installmentCount: attempt.installmentCount,
    chargedAmount: Number(attempt.chargedAmount),
    installmentFeeAmount: Number(attempt.installmentFeeAmount),
    capturedAt: toIso(attempt.capturedAt),
    applied: appliedId !== null && attempt.id === appliedId,
    createdAt: toIso(attempt.createdAt) as string,
  };
}

export function adminPaymentInstallmentOf(
  payment: AdminPaymentInstallmentSource,
): AdminPaymentInstallment {
  // The one reader of the PSP-scale columns; the card comes from `pricing`.
  const fields = paymentInstallmentFieldsOf({
    amount: payment.amount,
    chargedAmount: payment.chargedAmount,
    installmentCount: payment.installmentCount,
  });
  return {
    installmentCount: fields.installmentCount ?? 1,
    goodsAmount: new Prisma.Decimal(payment.amount).toNumber(),
    installmentFeeAmount: fields.installmentFeeAmount ?? 0,
    chargedAmount: fields.chargedAmount ?? Number(payment.amount),
    pricing: payment.chargeAttempt ? pricingOf(payment.chargeAttempt) : null,
    chargeAttempts: (payment.chargeAttempts ?? []).map((attempt) =>
      attemptOf(attempt, payment.chargeAttemptId ?? null),
    ),
  };
}
