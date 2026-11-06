/** @format */

import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { getInstallmentsConfig } from "@/lib/server/payments-config";
import { distanceSalesParts } from "./contract";

/**
 * The site page and the mobile WebView (`/app/distance-sales`) draw the same
 * text. The installment clauses follow the installment switch, read on the
 * server and fail closed (an unreachable API is off: the text without them).
 */
export default async function DistanceSalesDocument() {
  const [t, { enabled: installmentsEnabled }] = await Promise.all([
    getTranslations(),
    getInstallmentsConfig(),
  ]);
  return (
    <LegalDocument
      title={t("legal.distanceSalesTitle")}
      description={t("legal.distanceSales.pageDescription")}
      parts={distanceSalesParts(t, { installmentsEnabled })}
      footer={t("legal.distanceSales.pageFooter")}
    />
  );
}
