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
import { createHash } from "crypto";
import { INSTALLMENT_SETTINGS } from "@tarodan/types";
import type {
  InstallmentBuyerSegment,
  InstallmentOption,
  InstallmentOptionsCard,
  InstallmentOptionsReason,
  InstallmentOptionsResponse,
  PaymentsInstallmentsConfig,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { errorMessage } from "../../../common/helpers/error-message";
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
  paymentLaneConsistent,
  type InstallmentCardFacts,
  type InstallmentOfferResult,
  type InstallmentRateSource,
} from "./installment-eligibility";
import {
  INSTALLMENT_FEE_SPLIT_ORDER_BY,
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

/** A card PayTR knows (`success`). */
export type KnownCardFacts = Extract<CachedBinFacts, { outcome: "success" }>;

/** The card to price: a new card's BIN, or a saved card of the caller. */
export type InstallmentCardSource =
  { bin: string } | { savedCardId: string; userId: string };

const ORDER_SLICE_SELECT = {
  id: true,
  isTest: true,
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

/** The buyer, for the segment and the lane check. */
const TARGET_BUYER_SELECT = {
  ...INSTALLMENT_BUYER_SELECT,
  isTestAccount: true,
} satisfies Prisma.UserSelect;

const PAYMENT_SELECT = {
  id: true,
  amount: true,
  isTest: true,
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
      buyer: { select: TARGET_BUYER_SELECT },
    },
  },
  checkoutGroup: {
    select: {
      buyerId: true,
      isGuest: true,
      buyer: { select: TARGET_BUYER_SELECT },
      orders: {
        select: ORDER_SLICE_SELECT,
        orderBy: INSTALLMENT_FEE_SPLIT_ORDER_BY,
      },
    },
  },
} satisfies Prisma.PaymentSelect;

export type OptionsPayment = Prisma.PaymentGetPayload<{
  select: typeof PAYMENT_SELECT;
}>;
export type SliceOrder = Prisma.OrderGetPayload<{
  select: typeof ORDER_SLICE_SELECT;
}>;

/** What the options (and the signed charge) are priced for. */
export interface InstallmentPricingTarget {
  /** T. In payment mode `Payment.amount`, the amount signing charges from. */
  baseAmount: Prisma.Decimal;
  guest: boolean;
  buyer: InstallmentSegmentBuyer | null;
  /** The account the payment belongs to (order or cart buyer, trade payer). */
  ownerId: string | null;
  /** null in amount mode: there is no payment to check the kind of. */
  orders: SliceOrder[] | null;
  payment: OptionsPayment | null;
  /**
   * The payment's test-lane stamp agrees with its orders and its signed-in
   * buyer (plan 5.2). A mismatch is a data anomaly: no installments for it.
   * Always true in amount mode.
   */
  laneConsistent: boolean;
}

/**
 * The pricing of a target for a card (plan 5.2): the eligibility verdict and,
 * once the card and the rates were read, every count's outcome. One pipeline
 * for the options call and for signing.
 */
export interface InstallmentQuote {
  /** The buyer's segment, resolved on the server. */
  segment: InstallmentBuyerSegment;
  /** Why no count above 1 is offered; null = at least one is. */
  reason: InstallmentOptionsReason | null;
  card?: InstallmentOptionsCard;
  /** Set with `below_minimum`. */
  minAmount?: Prisma.Decimal;
  /** Set once the card and the rates were read. */
  priced?: {
    facts: KnownCardFacts;
    family: PaytrCardFamily;
    snapshot: InstallmentRateSource;
    result: InstallmentOfferResult;
  };
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
 * The Redis key of a BIN answer. The digits are hashed: a Redis command and
 * its key reach Sentry spans (ioredis instrumentation), the slowlog and
 * MONITOR, and card digits are never logged (docs/PCI_PAYMENT_PAGE.md).
 */
export function binCacheKey(digits: string): string {
  return `paytr:bin:${createHash("sha256").update(digits).digest("hex")}`;
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
    try {
      const { enabled, minAmount } = await this.settings.read();
      return { enabled, minAmount: money(minAmount) };
    } catch (error: unknown) {
      // The config endpoint also carries the bypass and card-storage flags
      // the pay screen needs: a settings read error must not fail it.
      // Installments show as off; direct-form re-reads the settings anyway.
      this.logger.warn(
        `Installment settings unreadable for /payments/config: ${errorMessage(error)}`,
      );
      return {
        enabled: false,
        minAmount: INSTALLMENT_SETTINGS.minAmount.default,
      };
    }
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
    const card: InstallmentCardSource = query.savedCardId
      ? { savedCardId: query.savedCardId, userId: caller.userId as string }
      : { bin: query.bin as string };
    const quote = await this.quoteTarget(target, card);
    const single = optionOf(singlePaymentPrice(target.baseAmount));
    if (quote.reason || !quote.priced) {
      Sentry.getIsolationScope().setTag(
        "installment_options",
        quote.reason ?? "unavailable",
      );
      return {
        enabled: false,
        reason: quote.reason ?? "unavailable",
        baseAmount: single.totalAmount,
        options: [single],
        ...(quote.card ? { card: quote.card } : {}),
        ...(quote.minAmount ? { minAmount: money(quote.minAmount) } : {}),
      };
    }
    Sentry.getIsolationScope().setTag("installment_options", "offered");
    return {
      enabled: true,
      card: quote.card ?? {},
      baseAmount: single.totalAmount,
      options: [
        single,
        ...quote.priced.result.offers.map((offer) => optionOf(offer.price)),
      ],
    };
  }

  /**
   * Prices `target` for a card: the settings (kill switch, minimum amount),
   * the payment kind and lane, the card (D5), the fresh rate snapshot, the
   * buyer's segment rules and, with orders, the keep guard. The options call
   * and the signing call (`InstallmentChargeService`) both run it, so what a
   * buyer is shown and what is signed cannot be priced two ways. A card is
   * read only when the settings and the payment allow installments.
   */
  async quoteTarget(
    target: InstallmentPricingTarget,
    cardSource: InstallmentCardSource,
    now: Date = new Date(),
  ): Promise<InstallmentQuote> {
    const segment = installmentSegmentOf({
      guest: target.guest,
      buyer: target.buyer,
    });
    Sentry.getIsolationScope().setTag("installment_segment", segment);
    const settings = await this.settings.read();
    const refuse = (
      reason: InstallmentOptionsReason,
      extra: Partial<InstallmentQuote> = {},
    ): InstallmentQuote => ({ segment, reason, ...extra });

    if (!settings.enabled) return refuse("disabled");
    if (target.payment && !this.kindAllows(target)) {
      return refuse("not_offered_for_payment");
    }
    if (target.baseAmount.lessThan(settings.minAmount)) {
      return refuse("below_minimum", { minAmount: settings.minAmount });
    }

    const facts =
      "savedCardId" in cardSource
        ? await this.savedCardFacts(cardSource.savedCardId, cardSource.userId)
        : await this.lookupCard(cardSource.bin);
    if (facts.outcome === "error") return refuse("unavailable");
    if (facts.outcome === "failed") return refuse("card_not_eligible");
    const card = cardOf(facts);
    if (!cardAllowsInstallments(facts) || !isPaytrCardFamily(facts.family)) {
      return refuse("card_not_eligible", { card });
    }

    const snapshot = await this.rates.freshSnapshot();
    if (!snapshot) return refuse("unavailable", { card });

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
    const priced = { facts, family: facts.family, snapshot, result };
    if (result.offers.length === 0) {
      return refuse(
        result.offeredByPaytr.length === 0
          ? "card_not_eligible"
          : "not_offered_for_payment",
        { card, priced },
      );
    }
    return { segment, reason: null, card, priced };
  }

  /**
   * BIN facts through the Redis cache (`binCacheKey`): `success` 7 days,
   * `failed` 1 day; an `error` or a timeout is not cached. A cache miss or a
   * Redis error falls through to PayTR, bounded by the 3 s timeout.
   */
  async lookupCard(bin: string): Promise<BinFacts> {
    const digits = normalizedBin(bin);
    const key = binCacheKey(digits);
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

  async savedCardFacts(
    savedCardId: string,
    userId: string,
  ): Promise<KnownCardFacts> {
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
   * valid payment capability for it (guests). Then 20 calls per payment per
   * minute on top of the per-IP throttle.
   */
  private async paymentTarget(
    paymentId: string,
    caller: InstallmentOptionsCaller,
  ): Promise<InstallmentPricingTarget> {
    const target = await this.loadPaymentTarget(paymentId);
    if (!target) {
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }
    const owns = !!caller.userId && target.ownerId === caller.userId;
    if (!caller.capabilityAuthorized && !owns) {
      throw new ForbiddenException(
        i18nMessage("server.payment.viewPaymentForbidden"),
      );
    }
    // Charged only after the access check: a stranger who knows the id
    // cannot spend the buyer's budget.
    await this.consumePaymentBudget(paymentId);
    return target;
  }

  /**
   * The payment as a pricing target, WITHOUT an access check (the caller
   * owns it: the options call checks the buyer or the capability first,
   * signing runs after `direct-form`'s own checks). T is `Payment.amount`;
   * the segment comes from the payment's buyer (a guest purchase is `guest`,
   * never the shared system account's tier); the orders are the keep guard's
   * slices. Null = no such payment.
   */
  async loadPaymentTarget(
    paymentId: string,
  ): Promise<InstallmentPricingTarget | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!payment) return null;
    const payerId = payment.tradeCashPayment?.payerId ?? null;
    const ownerId =
      payment.order?.buyerId ?? payment.checkoutGroup?.buyerId ?? payerId;
    const guest = payment.checkoutGroup
      ? payment.checkoutGroup.isGuest
      : isGuestAddress(payment.order?.shippingAddress ?? null);
    const orderBuyer =
      payment.order?.buyer ?? payment.checkoutGroup?.buyer ?? null;
    // A trade cash payment has no order: its buyer is the payer.
    const buyer = guest
      ? null
      : (orderBuyer ??
        (payerId
          ? await this.prisma.user.findUnique({
              where: { id: payerId },
              select: TARGET_BUYER_SELECT,
            })
          : null));
    const orders = payment.checkoutGroup
      ? payment.checkoutGroup.orders
      : payment.order
        ? [payment.order]
        : [];
    return {
      baseAmount: payment.amount,
      guest,
      buyer,
      ownerId,
      orders,
      payment,
      laneConsistent: paymentLaneConsistent({
        paymentIsTest: payment.isTest,
        orderIsTest: orders.map((order) => order.isTest),
        buyerIsTestAccount: buyer ? buyer.isTestAccount : null,
      }),
    };
  }

  private async amountTarget(
    amount: number,
    userId: string | null,
  ): Promise<InstallmentPricingTarget> {
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
      ownerId: userId,
      orders: null,
      payment: null,
      laneConsistent: true,
    };
  }

  /** D6 payment kind and the lane check (plan 5.2). */
  private kindAllows(target: InstallmentPricingTarget): boolean {
    const { payment, orders } = target;
    if (!payment) return true;
    if (!target.laneConsistent) {
      this.logger.warn(
        `INSTALLMENT_LANE_MISMATCH payment=${payment.id}: the payment's test-lane stamp differs from its orders or buyer; single payment only`,
      );
      return false;
    }
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
