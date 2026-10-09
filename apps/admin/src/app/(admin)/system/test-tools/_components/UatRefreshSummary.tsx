"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, DisclosureButton } from "@tarodan/ui";
import { DataTable } from "@/components/DataTable";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { TextLink } from "@/components/TextLink";
import { fmtDateTime } from "@/lib/format";
import type { UatRefreshRun } from "@/lib/api/system.types";
import {
  UatRefreshStateBadge,
  runDurationText,
  uatRefreshMaskedColumns,
} from "../_lib/uatRefreshColumns";

/**
 * Son bitmiş yenilemenin özeti: durum, zamanlar, kaynak kopya, GitHub bağlantısı,
 * yedek dosyası, sonradan uygulanan migration'lar, maskelenen satırlar (varsayılan
 * kapalı) ve başarısızsa hata metni.
 */
export function UatRefreshSummary({
  run,
  now,
}: {
  run: UatRefreshRun;
  now: number;
}) {
  const t = useTranslations();
  const [maskedOpen, setMaskedOpen] = useState(false);
  const base = "admin.system.testTools.uatRefresh.last";

  return (
    <div className="space-y-4">
      <SectionTitle as="h3" size="sm">
        {t(`${base}.title`)}
      </SectionTitle>
      <DataList>
        <Field label={t(`${base}.state`)}>
          <span className="inline-flex items-center gap-2">
            <UatRefreshStateBadge run={run} t={t} />
            {run.dryRun && (
              <span className="text-xs text-muted">{t(`${base}.dryRun`)}</span>
            )}
          </span>
        </Field>
        <Field label={t(`${base}.requestedAt`)}>
          {fmtDateTime(run.requestedAt) ?? "—"}
        </Field>
        <Field label={t(`${base}.requestedBy`)}>
          {run.requestedBy?.displayName ?? t(`${base}.requestedByGithub`)}
        </Field>
        <Field label={t(`${base}.duration`)}>
          {runDurationText(run, now, t)}
        </Field>
        <Field label={t(`${base}.sourceSnapshotAt`)}>
          {fmtDateTime(run.sourceSnapshotAt) ?? "—"}
        </Field>
        <Field label={t(`${base}.workflowRun`)}>
          {run.workflowRunUrl ? (
            <TextLink href={run.workflowRunUrl} external>
              {t(`${base}.openRun`)}
            </TextLink>
          ) : (
            "—"
          )}
        </Field>
        <Field label={t(`${base}.backupFile`)} mono>
          {run.backupFile ?? "—"}
        </Field>
      </DataList>

      <div>
        <p className="text-sm text-muted">{t(`${base}.migrations`)}</p>
        {run.migrationsApplied.length > 0 ? (
          <ul className="mt-1 list-inside list-disc font-mono text-xs text-body">
            {run.migrationsApplied.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-heading">
            {t(`${base}.migrationsNone`)}
          </p>
        )}
      </div>

      {run.masked.length > 0 && (
        <div className="space-y-2">
          <DisclosureButton
            open={maskedOpen}
            onClick={() => setMaskedOpen((open) => !open)}
            className="text-sm font-medium text-heading"
          >
            {t(`${base}.masked`, { count: run.masked.length })}
          </DisclosureButton>
          {maskedOpen && (
            <DataTable
              dense
              columns={uatRefreshMaskedColumns(t)}
              data={run.masked}
              getRowId={(r) => r.table}
            />
          )}
        </div>
      )}

      {run.error && (
        <Alert variant="danger" title={t(`${base}.error`)}>
          <span className="whitespace-pre-wrap break-words">{run.error}</span>
        </Alert>
      )}
    </div>
  );
}
