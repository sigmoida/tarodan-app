/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import MembershipSuccessClient from "./MembershipSuccessClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.success.page.uyelikGuncellendiTarodan"),
    robots: { index: false, follow: false },
  };
}

export default function MembershipSuccessPage() {
  return (
    <Suspense fallback={null}>
      <MembershipSuccessClient />
    </Suspense>
  );
}
