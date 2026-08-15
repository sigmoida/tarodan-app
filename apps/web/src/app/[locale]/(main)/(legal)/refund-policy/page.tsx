/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import RefundPolicyClient from "./_components/RefundPolicyClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.refundPolicy.page.iadePolitikasiTarodan"),
    description: t("page.refundPolicy.page.tarodanIadeVeIptalKosullariTalep"),
    alternates: localizedCanonical(locale, "/refund-policy"),
  };
}

export default function RefundPolicyPage() {
  return <RefundPolicyClient />;
}
