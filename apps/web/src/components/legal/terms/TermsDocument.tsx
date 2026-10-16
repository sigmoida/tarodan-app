/** @format */

import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { termsParts, termsUgcAddendum } from "./terms";

/**
 * `embed` (mobil WebView): koşulların ardına ayrı başlıklı "Uygulama İçi İçerik
 * Kuralları" eki (Apple 1.2) eklenir. Normal web sayfasında YOKTUR: koşullar
 * versiyonlu bir belge (`CONSENT_DOCUMENTS.terms`); metnini değiştirmek
 * yeniden onay ve hukuk kararı gerektirir.
 */
export default async function TermsDocument({
  embed = false,
}: {
  embed?: boolean;
}) {
  const t = await getTranslations();
  const parts = embed ? [...termsParts(t), termsUgcAddendum(t)] : termsParts(t);
  return (
    <LegalDocument
      title={t("legal.termsTitle")}
      description={t("legal.terms.pageDescription")}
      parts={parts}
      footer={t("legal.terms.pageFooter")}
    />
  );
}
