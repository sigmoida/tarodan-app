"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert, Badge } from "@tarodan/ui";
import {
  SELLER_TRUST_LEVEL_I18N_KEYS,
  type SellerTrustExplanation,
} from "@tarodan/types";
import { fmtDecimal } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { trustExplainRows } from "@/app/(admin)/accounts/users/[id]/_lib/trustBreakdown";
import { trustExplainColumns } from "@/app/(admin)/accounts/users/[id]/_lib/trustColumns";

/**
 * One computation laid open: per component the inputs, the rate, the
 * sub-score, the weight and the contribution, then the unrounded and rounded
 * score and the level. v1 and the candidate use the same panel, so they read
 * side by side; the candidate always carries its "not saved" label.
 */
export function ExplainPanel({
  title,
  explanation,
  candidate = false,
  formulaVersion,
}: {
  title: string;
  explanation: SellerTrustExplanation;
  candidate?: boolean;
  formulaVersion?: number;
}) {
  const t = useTranslations();
  const columns = useMemo(() => trustExplainColumns(t), [t]);
  const rows = useMemo(
    () => trustExplainRows(explanation, t),
    [explanation, t],
  );
  const { minimum } = explanation;

  return (
    <Panel
      className="min-w-0 space-y-4"
      data-testid={candidate ? "explain-candidate" : "explain-v1"}
    >
      <SectionTitle
        as="h3"
        size="md"
        actions={
          candidate ? (
            <Badge variant="warning">
              {t("admin.system.sellerTrustLab.candidateLabel")}
            </Badge>
          ) : undefined
        }
      >
        {title}
      </SectionTitle>
      <DataTable columns={columns} data={rows} getRowId={(r) => r.id} dense />
      <DataList columns={1}>
        <Field label={t("admin.system.sellerTrustLab.seller.unroundedScore")}>
          {fmtDecimal(explanation.score, 4)}
        </Field>
        <Field label={t("admin.system.sellerTrustLab.seller.roundedScore")}>
          {fmtDecimal(explanation.roundedX100 / 100)}
        </Field>
        <Field label={t("admin.users.detail.trust.level")}>
          {t(SELLER_TRUST_LEVEL_I18N_KEYS[explanation.level])}
        </Field>
        {formulaVersion !== undefined && (
          <Field label={t("admin.users.detail.trust.formulaVersion")}>
            {formulaVersion}
          </Field>
        )}
      </DataList>
      {!minimum.met && (
        <Alert variant="warning">
          {t("admin.system.sellerTrustLab.seller.notEnoughData", {
            transactions: minimum.transactions,
            counterparties: minimum.counterparties,
          })}
        </Alert>
      )}
    </Panel>
  );
}
