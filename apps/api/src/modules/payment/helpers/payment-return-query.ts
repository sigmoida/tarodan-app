import type { VirtualOrderKind } from "@tarodan/types";

/**
 * The query of both PayTR return URLs (`merchant_ok_url`, `merchant_fail_url`,
 * built in `PayTRService.createDirectPaymentForm`): the payment, the virtual
 * order kind as `type` (`membership`, `boost`; none for goods and trades) and
 * `guest=true` for a guest purchase. The web result pages read the payment's
 * status with it and show the result of the right purchase; without
 * `guest=true` a guest would be sent to the sign-in page. Mobile matches only
 * the path of these URLs, so the query is safe for every app version.
 */
export function paymentReturnQuery(input: {
  paymentId: string;
  kind?: VirtualOrderKind | null;
  guest?: boolean;
}): string {
  const params = new URLSearchParams({ paymentId: input.paymentId });
  if (input.kind) params.set("type", input.kind);
  if (input.guest) params.set("guest", "true");
  return params.toString();
}
