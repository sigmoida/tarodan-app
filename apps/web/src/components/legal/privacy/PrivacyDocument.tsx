/** @format */

import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { privacyParts } from "./privacy";

export default async function PrivacyDocument() {
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
