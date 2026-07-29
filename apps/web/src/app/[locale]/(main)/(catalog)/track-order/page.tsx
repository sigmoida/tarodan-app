/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@tarodan/ui/spinner";
import TrackOrderClient from "./TrackOrderClient";

export const metadata: Metadata = {
  title: "Sipariş Takibi | Tarodan",
  description:
    "Sipariş numaranız ve e-posta adresinizle siparişinizi takip edin.",
  robots: { index: false, follow: false },
};

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <PageShell className="flex items-center justify-center">
          <Spinner size="lg" />
        </PageShell>
      }
    >
      <TrackOrderClient />
    </Suspense>
  );
}
