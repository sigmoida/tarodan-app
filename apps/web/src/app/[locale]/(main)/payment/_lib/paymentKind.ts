/** @format */

import {
  isVirtualOrderKind,
  type VirtualOrderKind,
  type VirtualOrderPaymentFields,
} from "@tarodan/types";
import type { PaymentPurpose } from "@/lib/api";

/**
 * What a payment pays for: an order of goods (cart, single or offer order,
 * trade cash) or a virtual order (`membership`, `boost`). One reader for the
 * payment pages (`/payment/[id]`, `/payment/success`, `/payment/fail`), so
 * every page routes and words the same purchase the same way.
 */
export type PaymentKind = "checkout" | VirtualOrderKind;

/** The query parameter that names a virtual order (PayTR return URLs, pay links). */
export const PAYMENT_TYPE_PARAM = "type";
/** Set on the fail page when the buyer cancelled the payment themselves. */
export const PAYMENT_CANCELLED_PARAM = "cancelled";

export const MY_ORDERS_PATH = "/profile/orders";
export const MY_LISTINGS_PATH = "/profile/listings";
export const MY_BOOSTS_PATH = "/profile/boosts";
export const MEMBERSHIP_PATH = "/membership";
/** My listings opens the boost dialog for this listing (`?boost=<productId>`). */
export const BOOST_LISTING_PARAM = "boost";

/**
 * The kind of a payment. Once the payment is loaded its API flags decide
 * (`isBoostOrder`, `isMembershipOrder`: the server knows the order); before
 * that, or when it cannot be loaded, the `type` query of the URL. Anything
 * else is a checkout.
 */
export function paymentKind(
  type: string | null | undefined,
  payment?: VirtualOrderPaymentFields | null,
): PaymentKind {
  if (payment) {
    if (payment.isBoostOrder) return "boost";
    if (payment.isMembershipOrder) return "membership";
    return "checkout";
  }
  return isVirtualOrderKind(type) ? type : "checkout";
}

/**
 * The PayTR store a payment is taken on, which decides the saved cards and
 * card storage: membership has its own; boost is sold on the marketplace
 * store like goods (`resolvePaytrMerchant` in the API).
 */
export function paymentPurpose(kind: PaymentKind): PaymentPurpose {
  return kind === "membership" ? "membership" : "checkout";
}

export interface PaymentReturnContext {
  paymentId: string | null;
  /** A guest order or cart (`guest=true`). */
  guest?: boolean;
  /** Boost: the listing, so "Tekrar dene" reopens its dialog. */
  boostProductId?: string | null;
  /** Membership: the change kind its success page shows (`kind=`). */
  membershipChange?: string | null;
}

export interface PaymentReturnRoutes {
  /** The result of a completed payment. */
  success: string;
  /** The result of a failed payment. */
  fail: string;
  /** Where the pay page goes after the buyer cancels. */
  cancel: string;
  /** Where the pay page goes when the payment cannot be loaded. */
  exit: string;
  /** The purchase's own list (orders, membership, My boosts). */
  back: string;
  /** The fail page's "try again". */
  retry: string;
}

/** `/payment/success|fail` query: `paymentId`, `type` (virtual), `guest`. */
function resultQuery(
  kind: PaymentKind,
  ctx: PaymentReturnContext,
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams();
  if (ctx.paymentId) query.set("paymentId", ctx.paymentId);
  if (kind !== "checkout") query.set(PAYMENT_TYPE_PARAM, kind);
  if (ctx.guest) query.set("guest", "true");
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : "";
}

/**
 * Every route the payment pages send a buyer to, by kind. A boost or
 * membership payment never lands on `/profile/orders`: that list hides
 * virtual orders.
 */
export function paymentReturnRoutes(
  kind: PaymentKind,
  ctx: PaymentReturnContext,
): PaymentReturnRoutes {
  const success = `/payment/success${resultQuery(kind, ctx)}`;
  const fail = `/payment/fail${resultQuery(kind, ctx)}`;

  if (kind === "membership") {
    return {
      success: ctx.membershipChange
        ? `${MEMBERSHIP_PATH}/success?kind=${encodeURIComponent(ctx.membershipChange)}`
        : `${MEMBERSHIP_PATH}/success`,
      fail,
      cancel: MEMBERSHIP_PATH,
      exit: MEMBERSHIP_PATH,
      back: MEMBERSHIP_PATH,
      retry: MEMBERSHIP_PATH,
    };
  }

  if (kind === "boost") {
    return {
      success,
      fail,
      cancel: `/payment/fail${resultQuery(kind, ctx, { [PAYMENT_CANCELLED_PARAM]: "true" })}`,
      exit: MY_BOOSTS_PATH,
      back: MY_BOOSTS_PATH,
      retry: ctx.boostProductId
        ? `${MY_LISTINGS_PATH}?${BOOST_LISTING_PARAM}=${encodeURIComponent(ctx.boostProductId)}`
        : MY_LISTINGS_PATH,
    };
  }

  return {
    success,
    fail,
    cancel: ctx.guest ? "/" : "/cart",
    exit: ctx.guest ? "/" : MY_ORDERS_PATH,
    back: MY_ORDERS_PATH,
    retry: ctx.guest ? "/listings" : MY_ORDERS_PATH,
  };
}
