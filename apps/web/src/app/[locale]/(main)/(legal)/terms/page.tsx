/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { localizedCanonical } from "@/lib/seo";
import { termsParts } from "./_lib/terms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("legal.terms.metaTitle"),
    description: t("legal.terms.metaDescription"),
    alternates: localizedCanonical(locale, "/terms"),
  };
}

export default async function TermsPage() {
  const t = await getTranslations();
  return (
    <LegalDocument
      title={t("legal.termsTitle")}
      description={t("legal.terms.pageDescription")}
      parts={termsParts(t)}
      footer={t("legal.terms.pageFooter")}
    />
  );
}
