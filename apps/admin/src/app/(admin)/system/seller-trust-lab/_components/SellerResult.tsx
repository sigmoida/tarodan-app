"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import {
  SELLER_TRUST_LEVEL_I18N_KEYS,
  type SellerTrustLabSeller,
} from "@tarodan/types";
import { fmtDateTime, fmtDecimal } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { col } from "@/components/table";
import { trustBreakdownRows } from "@/app/(admin)/accounts/users/[id]/_lib/trustBreakdown";
import { trustBreakdownColumns } from "@/app/(admin)/accounts/users/[id]/_lib/trustColumns";
import {
  NOT_SCORED_KEY,
  changedInputRows,
  windowRows,
  type ChangedInputRow,
} from "../_lib/sellerMappers";
import { ExplainPanel } from "./ExplainPanel";

const S = "admin.system.sellerTrustLab.seller";
const NOT_SORTABLE = { sortable: false } as const;

const WINDOW_LABEL = {
  rating: `${S}.windowRating`,
  operations: `${S}.windowOperations`,
  volume: `${S}.windowVolume`,
} as const;

function StoredPanel({ seller }: { seller: SellerTrustLabSeller }) {
  const t = useTranslations();
  const { stored } = seller;
  const columns = useMemo(() => trustBreakdownColumns(t), [t]);
  const rows = useMemo(
    () => (stored?.components ? trustBreakdownRows(stored.components, t) : []),
    [stored, t],
  );
  if (!stored) return null;

  return (
    <Panel className="min-w-0 space-y-4">
      <SectionTitle as="h3" size="md">
        {t(`${S}.storedTitle`)}
      </SectionTitle>
      <DataList columns={2}>
        <Field label={t("admin.users.detail.trust.score")}>
          {stored.scoreX100 === null
            ? t("admin.users.detail.trust.notEnoughData")
            : `${fmtDecimal(stored.scoreX100 / 100)} / 5`}
        </Field>
        <Field label={t("admin.users.detail.trust.level")}>
          {t(SELLER_TRUST_LEVEL_I18N_KEYS[stored.level])}
        </Field>
        <Field label={t("admin.users.detail.trust.computedAt")}>
          {fmtDateTime(stored.computedAt) ?? "-"}
        </Field>
        <Field label={t("admin.users.detail.trust.formulaVersion")}>
          {stored.formulaVersion}
        </Field>
      </DataList>
      {stored.components ? (
        <DataTable columns={columns} data={rows} getRowId={(r) => r.id} dense />
      ) : (
        <Alert variant="warning">
          {t("admin.users.detail.trust.unavailable")}
        </Alert>
      )}
    </Panel>
  );
}

function Comparison({ seller }: { seller: SellerTrustLabSeller }) {
  const t = useTranslations();
  const comparison = seller.live?.comparison ?? null;
  const columns = useMemo(
    () => [
      col.text<ChangedInputRow>(
        t(`${S}.changedInputs`),
        (r) => r.label,
        NOT_SORTABLE,
      ),
      col.text<ChangedInputRow>(
        t(`${S}.colStored`),
        (r) => r.stored,
        NOT_SORTABLE,
      ),
      col.text<ChangedInputRow>(t(`${S}.colLive`), (r) => r.live, NOT_SORTABLE),
    ],
    [t],
  );
  const rows = useMemo(
    () => (comparison ? changedInputRows(comparison.changedInputs, t) : []),
    [comparison, t],
  );
  if (!comparison) return null;

  return (
    <div className="space-y-3">
      <Alert variant={comparison.sameScore ? "success" : "warning"}>
        {comparison.sameScore
          ? t(`${S}.matchesStored`)
          : t(`${S}.differsFromStored`)}
      </Alert>
      {rows.length > 0 && (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.field}
          dense
        />
      )}
    </div>
  );
}

/**
 * One seller explained: the stored row, the live v1 recompute and, when asked
 * for, the candidate side by side; plus the calculation windows. A not-scored
 * account shows its reason and no score; a seller without a stored row still
 * shows the live recompute.
 */
export function SellerResult({ seller }: { seller: SellerTrustLabSeller }) {
  const t = useTranslations();
  const { live, notScored, stored } = seller;
  const windows = useMemo(() => windowRows(seller.windows), [seller.windows]);

  return (
    <div className="space-y-4" data-testid="seller-result">
      <DataList columns={3}>
        <Field label={t(`${S}.title`)}>{seller.username}</Field>
        <Field label={t(`${S}.asOf`)}>
          {fmtDateTime(seller.asOf.at) ?? "-"}
        </Field>
      </DataList>
      {seller.asOf.requested !== seller.asOf.used && (
        <Alert variant="info">{t(`${S}.asOfFallback`)}</Alert>
      )}

      {notScored && (
        <Alert variant="warning">{t(NOT_SCORED_KEY[notScored])}</Alert>
      )}
      {!notScored && !stored && (
        <Alert variant="info">{t(`${S}.noStoredRow`)}</Alert>
      )}

      {live && (
        <>
          <Comparison seller={seller} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <StoredPanel seller={seller} />
            <ExplainPanel
              title={t(`${S}.recomputedTitle`)}
              explanation={live.v1}
              formulaVersion={1}
            />
            {live.candidate && (
              <ExplainPanel
                title={t(`${S}.candidateTitle`)}
                explanation={live.candidate}
                candidate
              />
            )}
          </div>
          <Panel tone="muted" padding="sm" className="space-y-2">
            <SectionTitle as="h3" size="sm">
              {t(`${S}.windows`)}
            </SectionTitle>
            <DataList columns={3}>
              {windows.map((w) => (
                <Field
                  key={w.id}
                  label={t(WINDOW_LABEL[w.id])}
                  layout="stacked"
                >
                  {w.range}
                </Field>
              ))}
            </DataList>
          </Panel>
        </>
      )}
      {notScored && stored && <StoredPanel seller={seller} />}
    </div>
  );
}
