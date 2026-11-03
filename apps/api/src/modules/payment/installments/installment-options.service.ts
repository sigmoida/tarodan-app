import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PaytrMerchant, Prisma, SavedCardStatus } from "@prisma/client";
import * as Sentry from "@sentry/node";
import type {
  InstallmentOption,
  InstallmentOptionsCard,
  InstallmentOptionsReason,
  InstallmentOptionsResponse,
  PaymentsInstallmentsConfig,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { i18nMessage } from "../../i18n";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PAYMENT_PROVIDER_PAYTR } from "../../payment-providers/payment-provider.interface";
import {
  isPaytrCardFamily,
  type PaytrCardFamily,
} from "../../payment-providers/paytr/paytr-installments";
import { escrowHoldAmountOf } from "../helpers/escrow-hold-amount";
import {
  INSTALLMENT_BIN_CACHE_TTL_SECONDS,
  INSTALLMENT_FEE_VAT_RATE_PCT,
  INSTALLMENT_OPTIONS_PAYMENT_LIMIT_PER_MINUTE,
  INSTALLMENT_PAYTR_USER_PATH_TIMEOUT_MS,
} from "./installment-config";
import {
  cardAllowsInstallments,
  evaluateInstallmentOffer,
  paymentKindAllowsInstallments,
  type InstallmentCardFacts,
} from "./installment-eligibility";
import {
  singlePaymentPrice,
  type InstallmentPrice,
  type KeepGuardSlice,
} from "./installment-pricing";
import { InstallmentRatesService } from "./installment-rates.service";
import { InstallmentRulesService } from "./installment-rules.service";
import {
  INSTALLMENT_BUYER_SELECT,
  installmentSegmentOf,
  type InstallmentSegmentBuyer,
} from "./installment-segment";
import { InstallmentSettingsService } from "./installment-settings.service";

/** The validated request (`InstallmentOptionsDto`). */
export interface InstallmentOptionsQuery {
  bin?: string;
  savedCardId?: string;
  paymentId?: string;
  amount?: number;
}

/** Who asks: the optional JWT user and the guest payment capability. */
export interface InstallmentOptionsCaller {
  userId: string | null;
  /** A valid `x-payment-capability` for `paymentId`. */
  capabilityAuthorized: boolean;
}

/** A PayTR BIN answer as cached in Redis (no card digits in the value). */
export type CachedBinFacts =
  | {
      outcome: "success";
      bank?: string;
      cardType?: string;
      family?: PaytrCardFamily;
      businessCard?: boolean;
    }
  | { outcome: "failed" };

/** `failed` / `success` are cacheable answers; `error` is a non-answer. */
export type BinFacts = CachedBinFacts | { outcome: "error" };

const ORDER_SLICE_SELECT = {
  origin: true,
  totalAmount: true,
  commissionAmount: true,
  withholdingTaxAmount: true,
  buyerServiceTaxAmount: true,
  sellerServiceTaxAmount: true,
  buyerShippingAmount: true,
  sellerShippingAmount: true,
  shippingCost: true,
  platformFundedDiscount: true,
} satisfies Prisma.OrderSelect;

const PAYMENT_SELECT = {
  id: true,
  amount: true,
  paytrMerchant: true,
  tradeCashPaymentId: true,
  orderId: true,
  checkoutGroupId: true,
  tradeCashPayment: { select: { payerId: true } },
  order: {
    select: {
      ...ORDER_SLICE_SELECT,
      buyerId: true,
      shippingAddress: true,
      buyer: { select: INSTALLMENT_BUYER_SELECT },
    },
  },
  checkoutGroup: {
    select: {
      buyerId: true,
      isGuest: true,
      buyer: { select: INSTALLMENT_BUYER_SELECT },
      orders: { select: ORDER_SLICE_SELECT, orderBy: { createdAt: "asc" } },
    },
  },
} satisfies Prisma.PaymentSelect;

type OptionsPayment = Prisma.PaymentGetPayload<{
  select: typeof PAYMENT_SELECT;
}>;
type SliceOrder = Prisma.OrderGetPayload<{ select: typeof ORDER_SLICE_SELECT }>;

/** What the options are priced for. */
interface PricingTarget {
  baseAmount: Prisma.Decimal;
  guest: boolean;
  buyer: InstallmentSegmentBuyer | null;
  /** null in amount mode: there is no payment to check the kind of. */
  orders: SliceOrder[] | null;
  payment: OptionsPayment | null;
}

/** A guest order keeps the flag in its delivery snapshot. */
function isGuestAddress(address: Prisma.JsonValue | null): boolean {
  return (
    !!address &&
    typeof address === "object" &&
    !Array.isArray(address) &&
    (address as Record<string, unknown>).isGuestOrder === true
  );
}

function money(value: Prisma.Decimal): number {
  return value.toNumber();
}

function optionOf(price: InstallmentPrice): InstallmentOption {
  return {
    count: price.count,
    totalAmount: money(price.chargedAmount),
    feeAmount: money(price.feeAmount),
    monthlyAmount: money(price.monthlyAmount),
  };
}

/** The PayTR BIN digits sent and cached: 8 when given, else 6. */
export function normalizedBin(bin: string): string {
  return bin.length >= 8 ? bin.slice(0, 8) : bin.slice(0, 6);
}

/**
 * `POST /payments/installment-options` (ADR 0019, plan 5.1-5.3). Read-only:
 * prices the counts a card may be charged for a payment (`paymentId`) or, on
 * the web single-page checkout before the order exists, for a displayed
 * amount. Never signs anything: `direct-form` recomputes the amount from the
 * payment row, the same rates, rules and settings, and refuses a different
 * `expectedTotal`, so a client-sent amount only changes what that client
 * shows. Every failure to price falls back to a single payment with a reason.
 *
 * Privacy: the BIN is sent to PayTR and cached in Redis under its digits; it
 * is never logged and never put on a Sentry event.
 */
@Injectable()
export class InstallmentOptionsService {
  private readonly logger = new Logger(InstallmentOptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly providers: PaymentProviderRegistry,
    private readonly settings: InstallmentSettingsService,
    private readonly rates: InstallmentRatesService,
    private readonly rules: InstallmentRulesService,
  ) {}

  /** `GET /payments/config` -> `installments`. */
  async publicConfig(): Promise<PaymentsInstallmentsConfig> {
    const { enabled, minAmount } = await this.settings.read();
    return { enabled, minAmount: money(minAmount) };
  }

  async getOptions(
    query: InstallmentOptionsQuery,
    caller: InstallmentOptionsCaller,
  ): Promise<InstallmentOptionsResponse> {
    const hasCard =
      (query.bin !== undefined) !== (query.savedCardId !== undefined);
    const hasTarget =
      (query.paymentId !== undefined) !== (query.amount !== undefined);
    if (!hasCard || !hasTarget) {
      throw new BadRequestException(
        i18nMessage("server.payment.installmentOptionsInvalidRequest"),
      );
    }
    if (query.savedCardId && !caller.userId) {
      throw new ForbiddenException(
        i18nMessage("server.payment.loginRequiredForSavedCard"),
      );
    }

    const target = query.paymentId
      ? await this.paymentTarget(query.paymentId, caller)
      : await this.amountTarget(query.amount as number, caller.userId);
    const settings = await this.settings.read();
    const single = optionOf(singlePaymentPrice(target.baseAmount));
    const answer = (
      reason: InstallmentOptionsReason,
      extra: Partial<InstallmentOptionsResponse> = {},
    ): InstallmentOptionsResponse => {
      Sentry.getIsolationScope().setTag("installment_options", reason);
      return {
        enabled: false,
        reason,
        baseAmount: single.totalAmount,
        options: [single],
        ...extra,
      };
    };

    if (!settings.enabled) return answer("disabled");
    if (target.payment && !this.kindAllows(target.payment, target.orders)) {
      return answer("not_offered_for_payment");
    }
    if (target.baseAmount.lessThan(settings.minAmount)) {
      return answer("below_minimum", { minAmount: money(settings.minAmount) });
    }

    const facts = query.savedCardId
      ? await this.savedCardFacts(query.savedCardId, caller.userId as string)
      : await this.lookupCard(query.bin as string);
    if (facts.outcome === "error") return answer("unavailable");
    if (facts.outcome === "failed") return answer("card_not_eligible");
    const card = cardOf(facts);
    if (!cardAllowsInstallments(facts) || !isPaytrCardFamily(facts.family)) {
      return answer("card_not_eligible", { card });
    }

    const snapshot = await this.rates.freshSnapshot();
    if (!snapshot) return answer("unavailable", { card });

    const now = new Date();
    const segment = installmentSegmentOf({
      guest: target.guest,
      buyer: target.buyer,
    });
    Sentry.getIsolationScope().setTag("installment_segment", segment);
    const result = evaluateInstallmentOffer({
      baseAmount: target.baseAmount,
      snapshot,
      family: facts.family,
      segment,
      rules: await this.rules.liveRules(segment, now),
      now,
      feeVatRatePct: INSTALLMENT_FEE_VAT_RATE_PCT,
      slices: target.orders ? target.orders.map(sliceOf) : null,
    });
    if (result.offers.length === 0) {
      return answer(
        result.offeredByPaytr.length === 0
          ? "card_not_eligible"
          : "not_offered_for_payment",
        { card },
      );
    }
    Sentry.getIsolationScope().setTag("installment_options", "offered");
    return {
      enabled: true,
      card,
      baseAmount: single.totalAmount,
      options: [single, ...result.offers.map((offer) => optionOf(offer.price))],
    };
  }

  /**
   * BIN facts through the Redis cache (`paytr:bin:<bin>`): `success` 7 days,
   * `failed` 1 day; an `error` or a timeout is not cached. A cache miss or a
   * Redis error falls through to PayTR, bounded by the 3 s timeout.
   */
  async lookupCard(bin: string): Promise<BinFacts> {
    const digits = normalizedBin(bin);
    const key = `paytr:bin:${digits}`;
    const cached = await this.cache.get<CachedBinFacts>(key);
    if (cached?.outcome === "success" || cached?.outcome === "failed") {
      return cached;
    }
    return Sentry.startSpan(
      { name: "paytr.bin_lookup", op: "paytr.bin_lookup" },
      async (span) => {
        const provider = this.providers.resolve(
          PAYMENT_PROVIDER_PAYTR,
          PaytrMerchant.marketplace,
        );
        const result = await provider.lookupBin(digits, {
          timeoutMs: INSTALLMENT_PAYTR_USER_PATH_TIMEOUT_MS,
        });
        span.setAttribute("outcome", result.outcome);
        if (!result.ok && result.outcome === "error") {
          // The PayTR client logged the failure (without the BIN).
          return { outcome: "error" } as const;
        }
        const facts: CachedBinFacts = result.ok
          ? {
              outcome: "success",
              bank: result.bank,
              cardType: result.cardType,
              family: result.cardFamily,
              businessCard: result.businessCard,
            }
          : { outcome: "failed" };
        await this.cache.set(key, facts, {
          ttl: INSTALLMENT_BIN_CACHE_TTL_SECONDS[facts.outcome],
        });
        return facts;
      },
    );
  }

  private async savedCardFacts(
    savedCardId: string,
    userId: string,
  ): Promise<CachedBinFacts> {
    const saved = await this.prisma.savedCard.findFirst({
      where: {
        id: savedCardId,
        userId,
        paytrMerchant: PaytrMerchant.marketplace,
        status: SavedCardStatus.active,
      },
      select: { brand: true, bank: true, cardType: true, businessCard: true },
    });
    if (!saved) {
      throw new NotFoundException(
        i18nMessage("server.payment.savedCardNotFound"),
      );
    }
    const family = saved.brand?.trim().toLowerCase();
    return {
      outcome: "success",
      bank: saved.bank ?? undefined,
      cardType: saved.cardType?.trim().toLowerCase(),
      family: isPaytrCardFamily(family) ? family : undefined,
      businessCard: saved.businessCard ?? undefined,
    };
  }

  /**
   * The payment, with the same access rule as `direct-form`: its buyer, or a
   * valid payment capability for it (guests). 20 calls per payment per
   * minute on top of the per-IP throttle.
   */
  private async paymentTarget(
    paymentId: string,
    caller: InstallmentOptionsCaller,
  ): Promise<PricingTarget> {
    await this.consumePaymentBudget(paymentId);
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!payment) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }
    const buyerId =
      payment.order?.buyerId ??
      payment.checkoutGroup?.buyerId ??
      payment.tradeCashPayment?.payerId ??
      null;
    const owns = !!caller.userId && buyerId === caller.userId;
    if (!caller.capabilityAuthorized && !owns) {
      throw new ForbiddenException(
        i18nMessage("server.payment.viewPaymentForbidden"),
      );
    }
    const guest = payment.checkoutGroup
      ? payment.checkoutGroup.isGuest
      : isGuestAddress(payment.order?.shippingAddress ?? null);
    const buyer = guest
      ? null
      : (payment.order?.buyer ?? payment.checkoutGroup?.buyer ?? null);
    const orders = payment.checkoutGroup
      ? payment.checkoutGroup.orders
      : payment.order
        ? [payment.order]
        : [];
    return { baseAmount: payment.amount, guest, buyer, orders, payment };
  }

  private async amountTarget(
    amount: number,
    userId: string | null,
  ): Promise<PricingTarget> {
    const buyer = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: INSTALLMENT_BUYER_SELECT,
        })
      : null;
    return {
      baseAmount: new Prisma.Decimal(amount).toDecimalPlaces(2),
      guest: !buyer,
      buyer,
      orders: null,
      payment: null,
    };
  }

  private kindAllows(
    payment: OptionsPayment,
    orders: SliceOrder[] | null,
  ): boolean {
    return paymentKindAllowsInstallments({
      paytrMerchant: payment.paytrMerchant,
      tradeCashPaymentId: payment.tradeCashPaymentId,
      orderId: payment.orderId,
      checkoutGroupId: payment.checkoutGroupId,
      orderOrigins: (orders ?? []).map((order) => order.origin),
    });
  }

  private async consumePaymentBudget(paymentId: string): Promise<void> {
    let allowed = true;
    try {
      ({ allowed } = await this.cache.checkRateLimit(
        `installments:options:payment:${paymentId}`,
        INSTALLMENT_OPTIONS_PAYMENT_LIMIT_PER_MINUTE,
        60,
      ));
    } catch {
      // Redis down: the per-IP throttle still applies; the call is read-only.
      this.logger.warn(
        `Installment options budget unavailable payment=${paymentId}`,
      );
    }
    if (!allowed) {
      throw new HttpException(
        i18nMessage("server.payment.installmentOptionsTooManyRequests"),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function sliceOf(order: SliceOrder): KeepGuardSlice {
  return {
    totalAmount: order.totalAmount,
    sellerAmount: new Prisma.Decimal(escrowHoldAmountOf(order).sellerAmount),
  };
}

function cardOf(
  facts: InstallmentCardFacts & { bank?: string },
): InstallmentOptionsCard {
  const card: InstallmentOptionsCard = {};
  if (facts.bank) card.bank = facts.bank;
  if (facts.family) card.family = facts.family;
  if (facts.cardType === "credit" || facts.cardType === "debit") {
    card.type = facts.cardType;
  }
  return card;
}
