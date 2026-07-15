/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Spinner } from "@tarodan/ui/spinner";
import MembershipCheckoutClient from "./MembershipCheckoutClient";

export const metadata: Metadata = {
  title: "Üyelik Yükseltme | Tarodan",
  description: "Üyeliğinizi güvenle yükseltin.",
  robots: { index: false, follow: false },
};

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
