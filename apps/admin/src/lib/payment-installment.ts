import type {
  AdminInstallmentRuleRef,
  AdminPaymentInstallment,
  AdminPaymentInstallmentPricing,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";

const L = "admin.finance.payments.installment";

/**
 * How the payment detail reads a payment's installment block:
 * - `installment`: captured with more than one count (the full block);
 * - `single`: a captured single payment, or a legacy one (all single);
 * - `notCaptured`: never paid, so the count is not known yet (the columns
 *   are written at capture); the attempts list shows what was signed.
 */
export type PaymentInstallmentKind = "installment" | "single" | "notCaptured";

export function paymentInstallmentKind(
  installment: AdminPaymentInstallment,
  paidAt: string | null | undefined,
): PaymentInstallmentKind {
  if (installment.installmentCount > 1) return "installment";
  if (!paidAt && !installment.pricing) return "notCaptured";
  return "single";
}

/** "Tek çekim" for one count, else "N taksit". */
export function installmentCountLabel(t: Translate, count: number): string {
  return count > 1
    ? t("admin.finance.installments.rules.countSingle", { count })
    : t(`${L}.single`);
}

/** The rule version, or the default (buyer pays all) when none won. */
export function installmentRuleLabel(
  t: Translate,
  rule: AdminInstallmentRuleRef | null,
): string {
  return rule
    ? t("admin.finance.installments.rules.nameVersion", {
        name: rule.name,
        version: rule.version,
      })
    : t("admin.finance.installments.preview.defaultRule");
}

/** "world · Bank · Kredi kartı · Ticari kart"; null when nothing is known. */
export function installmentCardLabel(
  t: Translate,
  pricing: AdminPaymentInstallmentPricing,
): string | null {
  const parts = [
    pricing.cardFamily,
    pricing.cardBank,
    pricing.cardType ? t(`${L}.cardTypes.${pricing.cardType}`) : null,
    pricing.businessCard ? t(`${L}.businessCard`) : null,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(" · ") : null;
}
