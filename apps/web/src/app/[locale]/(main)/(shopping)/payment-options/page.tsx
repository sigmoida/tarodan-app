/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import PaymentOptionsClient from "./_components/PaymentOptionsClient";
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

export default function PaymentOptionsPage() {
  return <PaymentOptionsClient />;
}
