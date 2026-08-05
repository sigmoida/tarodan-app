/** @format */

import PaymentPageClient from "./_components/PaymentPageClient";
import PaymentReplayGuard from "./_components/PaymentReplayGuard";

/**
 * Payment page — single payment surface (guest + member). All lifecycle,
 * card-form state and PayTR handling live in the client component + its hooks.
 *
 * Kart alanları bu sayfada toplanıp doğrudan PayTR'ye POST edildiği için sayfa
 * PCI DSS 6.4.3 kapsamındadır: middleware burada CSP'yi ZORLAR ve
 * `PaymentReplayGuard` oturum kaydını durdurur (bkz. docs/PCI_PAYMENT_PAGE.md).
 */
export default function PaymentPage() {
  return (
    <>
      <PaymentReplayGuard />
      <PaymentPageClient />
    </>
  );
}
