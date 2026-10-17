/** @format */

import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { distanceSalesParts } from "./contract";

export default async function DistanceSalesDocument() {
  const t = await getTranslations();
  return (
    <LegalDocument
      title={t("legal.distanceSalesTitle")}
      description={t("legal.distanceSales.pageDescription")}
      parts={distanceSalesParts(t)}
      footer={t("legal.distanceSales.pageFooter")}
    />
  );
}
