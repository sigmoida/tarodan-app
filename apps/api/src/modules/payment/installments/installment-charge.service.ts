import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PaytrMerchant, Prisma } from "@prisma/client";
import * as Sentry from "@sentry/node";
import type {
  DirectFormInstallmentSelection,
  InstallmentBuyerSegment,
} from "@tarodan/types";
import { i18nMessage } from "../../i18n";
import type { PaytrCardFamily } from "../../payment-providers/paytr/paytr-installments";
import { INSTALLMENT_FEE_VAT_RATE_PCT } from "./installment-config";
import {
  InstallmentOptionsService,
  type InstallmentCardSource,
} from "./installment-options.service";
import { installmentSegmentOf } from "./installment-segment";

/**
 * What one signed form charges and why (ADR 0019, plan 4.6.5): the amounts,
 * the rates and rule that priced them, the buyer's segment and the card.
 * Written as the form's `payment_charge_attempts` row inside the claim
 * transaction; the callback of that oid is checked against `chargedAmount`
 * and the capture copies the amounts onto the payment.
 */
export interface ChargeQuote {
  /** 1 = single payment (PayTR `installment_count = 0`), else 2..12. */
  installmentCount: number;
  /** T: `Payment.amount`. */
  baseAmount: Prisma.Decimal;
  /** F, VAT included; 0 for a single payment. */
  feeAmount: Prisma.Decimal;
  /** C = T + F: the signed `payment_amount`. */
  chargedAmount: Prisma.Decimal;
  /** P: the expected platform installment cost under the rule's share. */
  platformCostAmount: Prisma.Decimal;
  /** r1 and rn, percent; null for a single payment. */
  singleRatePct: Prisma.Decimal | null;
  installmentRatePct: Prisma.Decimal | null;
  /** v, percent (`INSTALLMENT_FEE_VAT_RATE_PCT` at signing). */
  feeVatRatePct: Prisma.Decimal;
  segment: InstallmentBuyerSegment;
  /** The winning rule version; null = the code default. */
  ruleId: string | null;
  platformSharePct: Prisma.Decimal;
  /** The quoted card; all null for a single payment. */
  card: {
    family: PaytrCardFamily | null;
    bank: string | null;
    type: string | null;
    businessCard: boolean | null;
  };
  /** First 6 digits of a new card's BIN (installments only). */
  bin6: string | null;
  savedCardId: string | null;
  rateSnapshotId: string | null;
}

export interface ChargeQuoteInput {
  paymentId: string;
  /**
   * What the payment's target (order, cart, trade cash row) says it is for.
   * Must equal `Payment.amount`: the callback is checked against the amount
   * signed, and the capture against `Payment.amount`.
   */
  targetTotal: Prisma.Decimal;
  /** The PayTR store the claim charges on (`resolvePaytrMerchant`). */
  paytrMerchant: PaytrMerchant;
  /** `DirectPaymentDto.installment`; absent = single payment. */
  selection?: DirectFormInstallmentSelection;
  /** `DirectPaymentDto.savedCardId`: the card being charged. */
  savedCardId?: string;
  userId: string | null;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Prices the charge of a `direct-form` (plan 5.1 step 4). The server reads T
 * from the payment row and prices the chosen count again through the options
 * pipeline (`InstallmentOptionsService.quoteTarget`: settings, payment kind
 * and lane, card, fresh rate snapshot, the buyer's segment rules, the keep
 * guard over the payment's orders), so the client's numbers only decide
 * whether the buyer saw the same total:
 *
 * - a count the pipeline does not offer: 400 `installmentNotOffered` (also a
 *   count above 1 without a card, or with a BIN and a saved card);
 * - the BIN service or the rates are unavailable: 409 `installmentUnavailable`
 *   (the client falls back to a single payment);
 * - a total other than `expectedTotal`: 409 `installmentPricingChanged`.
 *
 * Everything here runs BEFORE the claim (no PayTR call inside a
 * transaction): a refusal leaves the payment row untouched and writes no
 * attempt. Never logs card digits.
 */
@Injectable()
export class InstallmentChargeService {
  private readonly logger = new Logger(InstallmentChargeService.name);

  constructor(private readonly options: InstallmentOptionsService) {}

  async quoteCharge(input: ChargeQuoteInput): Promise<ChargeQuote> {
    const target = await this.options.loadPaymentTarget(input.paymentId);
    if (!target) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }
    const baseAmount = target.baseAmount;
    if (!baseAmount.equals(input.targetTotal)) {
      // The callback compares with what was signed and the capture with
      // `Payment.amount`: charging a total that differs from the payment
      // row would leave a paid order pending. Refuse before any charge.
      this.logger.error(
        `DIRECT_FORM_AMOUNT_DRIFT payment=${input.paymentId}: payment amount ${baseAmount.toFixed(2)} differs from its target total ${input.targetTotal.toFixed(2)}; form not signed`,
      );
      throw new ConflictException(
        i18nMessage("server.payment.paymentAmountOutOfDate"),
      );
    }
    const selection = input.selection;
    const count = selection?.count ?? 1;
    const scope = Sentry.getIsolationScope();
    scope.setTag("installment_count", String(count));

    if (count === 1) {
      if (selection && !baseAmount.equals(selection.expectedTotal)) {
        throw new ConflictException(
          i18nMessage("server.payment.installmentPricingChanged"),
        );
      }
      const segment = installmentSegmentOf(target);
      scope.setTag("installment_segment", segment);
      return singleChargeQuote(baseAmount, segment, input.savedCardId);
    }

    // count >= 2 (the DTO bounds it to 12). Selection is set here.
    const chosen = selection as DirectFormInstallmentSelection;
    const notOffered = () =>
      new BadRequestException(
        i18nMessage("server.payment.installmentNotOffered"),
      );
    if (input.paytrMerchant !== PaytrMerchant.marketplace) throw notOffered();
    const cardSource = this.cardSourceOf(chosen, input);
    if (!cardSource) throw notOffered();

    const quote = await this.options.quoteTarget(target, cardSource);
    scope.setTag("installment_segment", quote.segment);
    if (quote.reason === "unavailable") {
      throw new ConflictException(
        i18nMessage("server.payment.installmentUnavailable"),
      );
    }
    const priced = quote.priced;
    const offer = priced?.result.offers.find(
      (candidate) => candidate.price.count === count,
    );
    if (!priced || !offer) {
      if (priced?.result.excludedByKeepGuard.includes(count)) {
        this.logger.error(
          `INSTALLMENT_KEEP_GUARD_REFUSED payment=${input.paymentId} count=${count}: an order slice could not cover PayTR's deduction`,
        );
      }
      throw notOffered();
    }
    if (!offer.price.chargedAmount.equals(chosen.expectedTotal)) {
      throw new ConflictException(
        i18nMessage("server.payment.installmentPricingChanged"),
      );
    }
    scope.setTag("card_family", priced.family);
    scope.setTag("installment_rule", offer.rule.ruleId ?? "default");
    return {
      installmentCount: count,
      baseAmount,
      feeAmount: offer.price.feeAmount,
      chargedAmount: offer.price.chargedAmount,
      platformCostAmount: offer.price.platformCostAmount,
      singleRatePct: priced.snapshot.singleRatePct,
      installmentRatePct: offer.installmentRatePct,
      feeVatRatePct: INSTALLMENT_FEE_VAT_RATE_PCT,
      segment: quote.segment,
      ruleId: offer.rule.ruleId,
      platformSharePct: offer.rule.platformSharePct,
      card: {
        family: priced.family,
        bank: priced.facts.bank ?? null,
        type: priced.facts.cardType ?? null,
        businessCard: priced.facts.businessCard ?? null,
      },
      bin6: "bin" in cardSource ? cardSource.bin.slice(0, 6) : null,
      savedCardId: input.savedCardId ?? null,
      rateSnapshotId: priced.snapshot.id,
    };
  }

  /**
   * The card a count above 1 is priced for: the saved card being charged,
   * else the new card's BIN. Null (not offered) without a card, or with a
   * BIN next to a saved card (the BIN would price another card).
   */
  private cardSourceOf(
    selection: DirectFormInstallmentSelection,
    input: ChargeQuoteInput,
  ): InstallmentCardSource | null {
    if (input.savedCardId) {
      if (selection.bin !== undefined) return null;
      if (!input.userId) {
        throw new ForbiddenException(
          i18nMessage("server.payment.loginRequiredForSavedCard"),
        );
      }
      return { savedCardId: input.savedCardId, userId: input.userId };
    }
    return selection.bin ? { bin: selection.bin } : null;
  }
}

/** A single payment of T: no fee, no rule, no card snapshot. */
export function singleChargeQuote(
  baseAmount: Prisma.Decimal,
  segment: InstallmentBuyerSegment,
  savedCardId?: string,
): ChargeQuote {
  return {
    installmentCount: 1,
    baseAmount,
    feeAmount: ZERO,
    chargedAmount: baseAmount,
    platformCostAmount: ZERO,
    singleRatePct: null,
    installmentRatePct: null,
    feeVatRatePct: INSTALLMENT_FEE_VAT_RATE_PCT,
    segment,
    ruleId: null,
    platformSharePct: ZERO,
    card: { family: null, bank: null, type: null, businessCard: null },
    bin6: null,
    savedCardId: savedCardId ?? null,
    rateSnapshotId: null,
  };
}

/** The `payment_charge_attempts` row of a signed form. */
export function chargeAttemptCreateData(
  quote: ChargeQuote,
  form: {
    paymentId: string;
    merchantOid: string;
    paytrMerchant: PaytrMerchant;
  },
): Prisma.PaymentChargeAttemptUncheckedCreateInput {
  return {
    paymentId: form.paymentId,
    merchantOid: form.merchantOid,
    paytrMerchant: form.paytrMerchant,
    installmentCount: quote.installmentCount,
    baseAmount: quote.baseAmount,
    installmentFeeAmount: quote.feeAmount,
    chargedAmount: quote.chargedAmount,
    platformCostAmount: quote.platformCostAmount,
    singleRatePct: quote.singleRatePct,
    installmentRatePct: quote.installmentRatePct,
    feeVatRatePct: quote.feeVatRatePct,
    buyerSegment: quote.segment,
    installmentRuleId: quote.ruleId,
    platformSharePct: quote.platformSharePct,
    cardFamily: quote.card.family,
    cardBank: quote.card.bank,
    cardType: quote.card.type,
    businessCard: quote.card.businessCard,
    bin6: quote.bin6,
    savedCardId: quote.savedCardId,
    rateSnapshotId: quote.rateSnapshotId,
  };
}
