"use client";

import { useTranslations } from "next-intl";
import { Alert, Badge } from "@tarodan/ui";
import type { AdminInstallmentRatesInfo } from "@tarodan/types";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { STATUS_TONE } from "@/lib/status-tone";

const L = "admin.finance.installments.rates";

/**
 * The latest PayTR rate snapshot (read-only): whether it is fresh enough to
 * price with, when it was fetched, PayTR's maximum count and the card
 * families in it. Without a snapshot buyers see a single payment only.
 */
export function InstallmentRatesCard({
  rates,
}: {
  rates: AdminInstallmentRatesInfo;
}) {
  const t = useTranslations();

  if (!rates.rateSnapshotId) {
    return (
      <SectionCard title={t(`${L}.title`)}>
        <Alert variant="warning" title={t(`${L}.none.title`)}>
          {t(`${L}.none.description`)}
        </Alert>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t(`${L}.title`)} bodyClassName="space-y-4">
      <DataList columns={1}>
        <Field label={t(`${L}.status`)}>
          <Badge variant={rates.fresh ? STATUS_TONE.live : STATUS_TONE.ended}>
            {rates.fresh ? t(`${L}.fresh`) : t(`${L}.stale`)}
          </Badge>
        </Field>
        <Field label={t(`${L}.fetchedAt`)}>
          {fmtDateTime(rates.fetchedAt) ?? "—"}
        </Field>
        <Field label={t(`${L}.maxCount`)}>
          {fmtNumber(rates.maxInstallmentNonBusiness) ?? "—"}
        </Field>
        <Field label={t(`${L}.families`)}>
          {rates.families.length > 0 ? rates.families.join(", ") : "—"}
        </Field>
      </DataList>
      {!rates.fresh && <Alert variant="warning">{t(`${L}.staleHint`)}</Alert>}
    </SectionCard>
  );
}
