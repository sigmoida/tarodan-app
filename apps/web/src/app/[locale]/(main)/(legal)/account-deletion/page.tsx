/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedCanonical } from "@/lib/seo";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { accountDeletionParts } from "./_lib/account-deletion";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("legal.accountDeletion.metaTitle"),
    description: t("legal.accountDeletion.metaDescription"),
    alternates: localizedCanonical(locale, "/account-deletion"),
  };
}

/**
 * Herkese açık hesap silme bilgi sayfası (Google Play şartı) — giriş
 * gerektirmez, statik içeriktir.
 */
export default async function AccountDeletionPage() {
  const t = await getTranslations();
  return (
    <LegalDocument
      title={t("legal.accountDeletion.title")}
      description={t("legal.accountDeletion.pageDescription")}
      parts={accountDeletionParts(t)}
      footer={t("legal.accountDeletion.pageFooter")}
    />
  );
}
