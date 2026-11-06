"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import type { AdminInstallmentRuleRef } from "@tarodan/types";

/**
 * Overlapping rules of the same priority: allowed, but the tie-break (a
 * specific segment before everyone, then the newest) decides between them,
 * so the admin is told which rules they are.
 */
export function OverlapWarning({
  overlaps,
  onClose,
}: {
  overlaps: readonly AdminInstallmentRuleRef[];
  onClose?: () => void;
}) {
  const t = useTranslations();
  const rules = overlaps
    .map((ref) =>
      t("admin.finance.installments.rules.nameVersion", {
        name: ref.name,
        version: ref.version,
      }),
    )
    .join(", ");
  return (
    <Alert
      variant="warning"
      title={t("admin.finance.installments.rules.overlap.title")}
      onClose={onClose}
    >
      {t("admin.finance.installments.rules.overlap.description", { rules })}
    </Alert>
  );
}
