"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import {
  SELLER_TRUST_LEVEL_I18N_KEYS,
  formatTrustRating,
  type AdminSellerTrustView,
} from "@tarodan/types";
import { fmtDateTime } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { trustBreakdownRows } from "../_lib/trustBreakdown";
import { trustBreakdownColumns } from "../_lib/trustColumns";

/**
 * The seller trust score of the user: score and level, when the nightly batch
 * last computed it, and the per-component breakdown. Read-only; everything
 * comes from the `trust` field of the user detail (never null; `computedAt`
 * null means no stored row yet). `components` is null when the stored
 * breakdown is from another formula version.
 */
export function SellerTrustSection({ trust }: { trust: AdminSellerTrustView }) {
  const t = useTranslations();
  const locale = useLocale();
  const columns = useMemo(() => trustBreakdownColumns(t), [t]);
  const rows = useMemo(
    () =>
      trust.components ? trustBreakdownRows(trust.components, t, locale) : [],
    [trust.components, t, locale],
  );

  const computed = trust.computedAt !== null;
  const scoreText =
    trust.rating !== null
      ? `${formatTrustRating(trust.rating, locale)} / 5`
      : computed
        ? t("admin.users.detail.trust.notEnoughData")
        : t("admin.users.detail.trust.notComputed");

  return (
    <SectionCard
      title={t("admin.users.detail.trust.title")}
      bodyClassName="space-y-4"
    >
      <DataList>
        <Field label={t("admin.users.detail.trust.score")}>{scoreText}</Field>
        <Field label={t("admin.users.detail.trust.level")}>
          {t(SELLER_TRUST_LEVEL_I18N_KEYS[trust.level])}
        </Field>
        <Field label={t("admin.users.detail.trust.computedAt")}>
          {computed
            ? (fmtDateTime(trust.computedAt) ?? "-")
            : t("admin.users.detail.trust.notComputed")}
        </Field>
        <Field label={t("admin.users.detail.trust.formulaVersion")}>
          {trust.formulaVersion}
        </Field>
      </DataList>
      {computed &&
        (trust.components ? (
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            dense
          />
        ) : (
          <Alert variant="warning">
            {t("admin.users.detail.trust.unavailable")}
          </Alert>
        ))}
    </SectionCard>
  );
}
