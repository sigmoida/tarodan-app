/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@tarodan/ui/spinner";
import TrackOrderClient from "./TrackOrderClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.trackOrder.page.siparisTakibiTarodan"),
    description: t("page.trackOrder.page.siparisNumaranizVeEPostaAdresinizle"),
    robots: { index: false, follow: false },
  };
}

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
