/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { localizedCanonical } from "@/lib/seo";
import { shippingDeliveryParts } from "./_lib/shipping-delivery";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("information.shippingDelivery.metaTitle"),
    description: t("information.shippingDelivery.metaDescription"),
    alternates: localizedCanonical(locale, "/shipping-delivery"),
  };
}

export default async function ShippingDeliveryPage() {
  const t = await getTranslations();
  return (
    <LegalDocument
      title={t("information.shippingDelivery.pageTitle")}
      description={t("information.shippingDelivery.pageDescription")}
      parts={shippingDeliveryParts(t)}
      footer={t("information.shippingDelivery.pageFooter")}
    />
  );
}
