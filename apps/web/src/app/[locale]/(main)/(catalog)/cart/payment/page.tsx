import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@tarodan/ui/spinner";
import CheckoutClient from "../../checkout/CheckoutClient";

export const metadata: Metadata = {
  title: "Ödeme | Tarodan",
  description: "Siparişinizi güvenle tamamlayın.",
  robots: { index: false, follow: false },
};

export default function CartPaymentPage() {
  return (
    <Suspense
      fallback={
        <PageShell className="flex items-center justify-center">
          <Spinner size="lg" />
        </PageShell>
      }
    >
      <CheckoutClient />
    </Suspense>
  );
}
