/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@tarodan/ui/spinner";
import MembershipCheckoutClient from "./MembershipCheckoutClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.checkout.page.uyelikYukseltmeTarodan"),
    description: t("page.checkout.page.uyeliginiziGuvenleYukseltin"),
    robots: { index: false, follow: false },
  };
}

export default function MembershipCheckoutPage() {
  return (
    <Suspense
      fallback={
        <PageShell className="flex items-center justify-center">
          <Spinner size="lg" />
        </PageShell>
      }
    >
      <MembershipCheckoutClient />
    </Suspense>
  );
}
