import type { BoostPaymentSummary } from "./boost";

/**
 * Virtual orders: a platform service sold as an ordinary Order on a virtual
 * product (`membership-<tierId>`, `boost-<boostId>`) and paid through the
 * normal payment flow. The kind is also the `type` query parameter of the
 * PayTR return URLs (`/payment/success`, `/payment/fail`); the web payment
 * pages read it to show the result of the right purchase.
 */
export const VIRTUAL_ORDER_KINDS = ["membership", "boost"] as const;
export type VirtualOrderKind = (typeof VIRTUAL_ORDER_KINDS)[number];

/** Whether a `type` query value is a virtual order kind. */
export function isVirtualOrderKind(value: unknown): value is VirtualOrderKind {
  return (
    typeof value === "string" &&
    (VIRTUAL_ORDER_KINDS as readonly string[]).includes(value)
  );
}

/**
 * What an order sells, on every order response (`kind`): a marketplace
 * listing or one of the platform services above. The API derives it from the
 * virtual product id (`virtualOrderKind`), never from the order number.
 */
export const ORDER_KINDS = ["listing", ...VIRTUAL_ORDER_KINDS] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

/**
 * The order response fields that tell a digital order apart. `kind` is the
 * contract; `origin` and the deprecated `isMembership` are the fallbacks for
 * an API that does not send `kind` yet.
 */
export interface DigitalOrderSignals {
  kind?: string | null;
  origin?: string | null;
  /** @deprecated True for every platform-service order; read `kind`. */
  isMembership?: boolean | null;
}

/**
 * Whether an order sells a digital platform service (membership, boost)
 * rather than goods: such an order has no shipping, escrow, refund request,
 * delivery confirmation, cancellation or rating. The one client rule for
 * gating physical-goods UI; web imports it and mobile vendors it.
 *
 * A non-empty `kind` decides (any value other than `listing` is a platform
 * service, so a kind added later is never shown as goods). Without it the
 * order is digital when `origin` is `platform_service` or `isMembership` is
 * true.
 */
export function isDigitalOrder(
  order: DigitalOrderSignals | null | undefined,
): boolean {
  if (!order) return false;
  if (typeof order.kind === "string" && order.kind !== "") {
    return order.kind !== "listing";
  }
  return order.origin === "platform_service" || order.isMembership === true;
}

/**
 * The additive fields a virtual order adds to a payment's status
 * (`GET /payments/:id/status`, `/status-guest`, `GET /payments/:id`); an
 * order of goods has none of them. `boost` is null only if the boost row is
 * missing.
 */
export interface VirtualOrderPaymentFields {
  isMembershipOrder?: true;
  isBoostOrder?: true;
  boost?: BoostPaymentSummary | null;
}
