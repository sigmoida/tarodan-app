/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedCanonical } from "@/lib/seo";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { privacyParts } from "./_lib/privacy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("legal.privacy.metaTitle"),
    description: t("legal.privacy.metaDescription"),
    alternates: localizedCanonical(locale, "/privacy"),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations();
  return (
    <LegalDocument
      title={t("legal.privacyTitle")}
      description={t("legal.privacy.pageDescription")}
      parts={privacyParts(t)}
      footer={t("legal.privacy.pageFooter")}
    />
  );
}
