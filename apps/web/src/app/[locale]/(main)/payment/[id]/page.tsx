/** @format */

import PaymentPageClient from "./_components/PaymentPageClient";

/**
 * Payment page — single payment surface (guest + member). All lifecycle,
 * card-form state and PayTR handling live in the client component + its hooks.
 */
export default function PaymentPage() {
  return <PaymentPageClient />;
}
