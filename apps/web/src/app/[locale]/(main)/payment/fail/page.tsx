/** @format */

import { Suspense } from "react";
import PaymentFailClient from "./_components/PaymentFailClient";

/**
 * Ödeme rotasında CSP zorlayıcı ve nonce istek başına üretiliyor; statik
 * ön-render edilen HTML'e nonce basılamadığı için satır içi hidrasyon
 * script'leri bloklanırdı. Sonuç ekranı kişiye özel olduğundan istek anında
 * render edilir (bkz. `payment/success/page.tsx`).
 */
export const dynamic = "force-dynamic";

export default function PaymentFailPage() {
  return (
    <Suspense fallback={null}>
      <PaymentFailClient />
    </Suspense>
  );
}
