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
