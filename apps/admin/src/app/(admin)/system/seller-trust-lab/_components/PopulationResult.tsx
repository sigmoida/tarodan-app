"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert, Badge, Button } from "@tarodan/ui";
import {
  SELLER_TRUST_LEVEL_I18N_KEYS,
  type SellerTrustLabPopulation,
} from "@tarodan/types";
import { downloadBlob } from "@/lib/download";
import { fmtDateTime, fmtDecimal, fmtNumber } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { col } from "@/components/table";
import {
  LEVEL_ORDER,
  hasFilters,
  isRunInProgress,
  levelCountRows,
  levelMatrixRows,
  moverRows,
  type LevelCountRow,
  type LevelMatrixRow,
  type MoverRow,
} from "../_lib/populationMappers";
import { PopulationHistogram } from "./PopulationHistogram";

const P = "admin.system.sellerTrustLab.population";
const NOT_SORTABLE = { sortable: false } as const;

function MoversTable({ title, rows }: { title: string; rows: MoverRow[] }) {
  const t = useTranslations();
  const columns = useMemo(
    () => [
      col.link<MoverRow>(
        t("admin.system.sellerTrustLab.seller.title"),
        (r) => ({ href: `/accounts/users/${r.userId}`, label: r.username }),
        NOT_SORTABLE,
      ),
      col.text<MoverRow>(t(`${P}.colStored`), (r) => r.stored, NOT_SORTABLE),
      col.text<MoverRow>(
        t(`${P}.colCandidate`),
        (r) => r.candidate,
        NOT_SORTABLE,
      ),
    ],
    [t],
  );
  return (
    <div className="min-w-0 space-y-2">
      <SectionTitle as="h3" size="sm">
        {title}
      </SectionTitle>
      <DataTable columns={columns} data={rows} getRowId={(r) => r.id} dense />
    </div>
  );
}

/** Download the API's proposal as it is: aggregates only, no seller identifier. */
export function downloadProposal(
  proposal: SellerTrustLabPopulation["proposal"],
) {
  downloadBlob(
    `seller-trust-proposal-${proposal.generatedAt.slice(0, 10)}.json`,
    JSON.stringify(proposal, null, 2),
    "application/json;charset=utf-8;",
  );
}

/**
 * A population run: how many rows were read and compared, the v1 consistency
 * check, the level and score distributions, the stored-to-candidate level
 * matrix, the biggest movers and the proposal download.
 */
export function PopulationResult({ data }: { data: SellerTrustLabPopulation }) {
  const t = useTranslations();
  const { summary } = data;

  const levelColumns = useMemo(
    () => [
      col.text<LevelCountRow>(
        t("admin.users.detail.trust.level"),
        (r) => r.label,
        NOT_SORTABLE,
      ),
      col.number<LevelCountRow>(
        t(`${P}.colStored`),
        (r) => r.stored,
        NOT_SORTABLE,
      ),
      col.number<LevelCountRow>(
        t(`${P}.colCandidate`),
        (r) => r.candidate,
        NOT_SORTABLE,
      ),
    ],
    [t],
  );
  const levelRows = useMemo(
    () => levelCountRows(summary.levels, t),
    [summary.levels, t],
  );

  const matrixColumns = useMemo(
    () => [
      col.text<LevelMatrixRow>(
        t(`${P}.colStored`),
        (r) => r.label,
        NOT_SORTABLE,
      ),
      ...LEVEL_ORDER.map((level) =>
        col.number<LevelMatrixRow>(
          t(SELLER_TRUST_LEVEL_I18N_KEYS[level]),
          (r) => r[level],
          NOT_SORTABLE,
        ),
      ),
    ],
    [t],
  );
  const matrixRows = useMemo(
    () => levelMatrixRows(summary.levelMatrix, t),
    [summary.levelMatrix, t],
  );

  const up = useMemo(() => moverRows(data.movers.up), [data.movers.up]);
  const down = useMemo(() => moverRows(data.movers.down), [data.movers.down]);

  if (summary.rowsRead === 0) {
    return (
      <Alert variant="info">
        {hasFilters(data.filters) ? t(`${P}.noMatch`) : t(`${P}.empty`)}
      </Alert>
    );
  }

  const { v1Consistency: consistency, changes } = summary;
  const range =
    summary.computedAt.min && summary.computedAt.max
      ? `${fmtDateTime(summary.computedAt.min) ?? "-"} – ${fmtDateTime(summary.computedAt.max) ?? "-"}`
      : "-";

  return (
    <div className="space-y-4" data-testid="population-result">
      {isRunInProgress(summary) && (
        <Alert variant="info">{t(`${P}.inProgress`)}</Alert>
      )}
      {consistency.mismatched > 0 && (
        <Alert variant="warning">
          {t(`${P}.consistency.warning`, {
            count: fmtNumber(consistency.mismatched) ?? "",
          })}
        </Alert>
      )}

      <DataList columns={3}>
        <Field label={t(`${P}.rowsRead`)}>{fmtNumber(summary.rowsRead)}</Field>
        <Field label={t(`${P}.rowsCompared`)}>
          {fmtNumber(summary.rowsCompared)}
        </Field>
        <Field label={t(`${P}.skippedOtherVersion`)}>
          {fmtNumber(summary.skippedOtherVersion)}
        </Field>
        <Field label={t(`${P}.skippedUnreadable`)}>
          {fmtNumber(summary.skippedUnreadable)}
        </Field>
        <Field label={t(`${P}.computedRange`)}>{range}</Field>
      </DataList>

      <Panel tone="muted" padding="sm" className="space-y-2">
        <SectionTitle as="h3" size="sm">
          {t(`${P}.consistency.title`)}
        </SectionTitle>
        <DataList columns={3}>
          <Field label={t(`${P}.consistency.matched`)}>
            {fmtNumber(consistency.matched)}
          </Field>
          <Field label={t(`${P}.consistency.offByOne`)}>
            {fmtNumber(consistency.offByOne)}
          </Field>
          <Field label={t(`${P}.consistency.mismatched`)}>
            {fmtNumber(consistency.mismatched)}
          </Field>
        </DataList>
      </Panel>

      <div className="flex items-center gap-2">
        <Badge variant="warning">
          {t("admin.system.sellerTrustLab.candidateLabel")}
        </Badge>
      </div>

      <DataList columns={3}>
        <Field label={t(`${P}.newToScored`)}>
          {fmtNumber(summary.newToScored)}
        </Field>
        <Field label={t(`${P}.scoredToNew`)}>
          {fmtNumber(summary.scoredToNew)}
        </Field>
        <Field label={t(`${P}.changed`)}>
          {`${fmtNumber(changes.changed) ?? "0"} / ${fmtNumber(changes.bothScored) ?? "0"}`}
        </Field>
        <Field label={t(`${P}.meanChange`)}>
          {fmtDecimal(changes.meanAbsX100 / 100)}
        </Field>
        <Field label={t(`${P}.maxChange`)}>
          {fmtDecimal(changes.maxAbsX100 / 100)}
        </Field>
      </DataList>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <SectionTitle as="h3" size="sm">
            {t(`${P}.levelCounts`)}
          </SectionTitle>
          <DataTable
            columns={levelColumns}
            data={levelRows}
            getRowId={(r) => r.level}
            dense
          />
        </div>
        <div className="min-w-0 space-y-2">
          <SectionTitle as="h3" size="sm">
            {t(`${P}.histogram`)}
          </SectionTitle>
          <PopulationHistogram histogram={summary.histogram} />
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <SectionTitle as="h3" size="sm">
          {t(`${P}.matrix`)}
        </SectionTitle>
        <DataTable
          columns={matrixColumns}
          data={matrixRows}
          getRowId={(r) => r.level}
          dense
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MoversTable title={t(`${P}.moversUp`)} rows={up} />
        <MoversTable title={t(`${P}.moversDown`)} rows={down} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={() => downloadProposal(data.proposal)}
        >
          {t(`${P}.download`)}
        </Button>
        <span className="text-sm text-muted">{t(`${P}.downloadHint`)}</span>
      </div>
    </div>
  );
}
