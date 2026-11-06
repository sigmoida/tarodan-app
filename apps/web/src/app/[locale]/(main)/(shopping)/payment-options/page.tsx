/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import { getInstallmentsConfig } from "@/lib/server/payments-config";
import PaymentOptionsContent from "./_components/PaymentOptionsContent";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.paymentOptions.page.odemeSecenekleriTarodan"),
    description: t(
      "page.paymentOptions.page.tarodanUzerindeKabulEdilenOdemeYontemleri",
    ),
    alternates: localizedCanonical(locale, "/payment-options"),
  };
}

export default async function PaymentOptionsPage() {
  const { enabled } = await getInstallmentsConfig();
  return <PaymentOptionsContent installmentsEnabled={enabled} />;
}
