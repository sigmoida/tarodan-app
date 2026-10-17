/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { localizedCanonical } from "@/lib/seo";
import { getTimingPolicy } from "@/lib/server/timing-policy";
import { withTimingValues } from "@/lib/timing-policy";
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
  // Hazırlama süresi (preparingDeadlineDays) Süreler ve Kurallar'dan gelir.
  const t = withTimingValues(await getTranslations(), await getTimingPolicy());
  return (
    <LegalDocument
      title={t("information.shippingDelivery.pageTitle")}
      description={t("information.shippingDelivery.pageDescription")}
      parts={shippingDeliveryParts(t)}
      footer={t("information.shippingDelivery.pageFooter")}
    />
  );
}
