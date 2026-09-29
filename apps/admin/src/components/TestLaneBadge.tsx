"use client";

import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";

/**
 * Test şeridi kaydı işareti (App Review / mobil QA hesapları — PayTR test modu,
 * tahsilat/kargo/e-fatura yok). Operasyonel listeler ve detaylar test kaydını
 * GİZLEMEZ, bu rozetle işaretler; raporlar ise onu hiç saymaz (API tarafı).
 *
 * `isTest` false/undefined ise hiçbir şey çizmez — çağıran koşul yazmaz.
 */
export function TestLaneBadge({
  isTest,
  className,
}: {
  isTest: boolean | null | undefined;
  className?: string;
}) {
  const t = useTranslations();
  if (!isTest) return null;
  return (
    <Badge
      variant="warning"
      appearance="solid"
      size="sm"
      className={className}
      title={t("admin.shared.testLane.hint")}
    >
      {t("admin.shared.testLane.badge")}
    </Badge>
  );
}
