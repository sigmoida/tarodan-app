"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Input, Select, Spinner } from "@tarodan/ui";
import type {
  AdminInstallmentRatesInfo,
  AdminInstallmentRule,
  InstallmentBuyerSegment,
} from "@tarodan/types";
import { DataTable } from "@/components/DataTable";
import { extractErrorMessage } from "@/lib/error";
import { fmtDateTime } from "@/lib/format";
import { useInstallmentPreview } from "../_hooks/useInstallmentPreview";
import {
  PREVIEW_AMOUNT_MAX,
  PREVIEW_DEFAULT_AMOUNT,
  previewAmountOf,
  previewParamsOf,
} from "../_lib/preview";
import { previewColumns } from "../_lib/preview-columns";
import type { InstallmentRuleDraft } from "../_lib/rule-form";
import {
  INSTALLMENT_BUYER_SEGMENTS,
  installmentSegmentLabel,
  installmentSegmentOptions,
  isBuyerSegment,
} from "../_lib/segments";

const L = "admin.finance.installments.preview";

/** The id the preview gives a draft rule's rows (the API's `DRAFT_RULE_ID`). */
const DRAFT_RULE_ID = "draft";

export interface InstallmentPreviewProps {
  rates: AdminInstallmentRatesInfo;
  /** For the rule names in the table. */
  rules: readonly AdminInstallmentRule[];
  /**
   * Draft mode (the rule form): the draft priced as if it were live now, or
   * null while the draft has errors. Left out: the live rules only.
   */
  draft?: InstallmentRuleDraft | null;
  /** The version a new version replaces (left out of the live rules). */
  replacesRuleId?: string;
}

/**
 * The option table a buyer of a segment would see for a goods total and a
 * card family, from the latest rate snapshot. In draft mode a draft for one
 * segment fixes the previewed segment to it; a draft for everyone lets the
 * admin pick the segment.
 */
export function InstallmentPreview({
  rates,
  rules,
  draft,
  replacesRuleId,
}: InstallmentPreviewProps) {
  const t = useTranslations();
  const draftMode = draft !== undefined;
  const [pickedSegment, setPickedSegment] =
    useState<InstallmentBuyerSegment>("free");
  const [amountText, setAmountText] = useState(PREVIEW_DEFAULT_AMOUNT);
  const [pickedFamily, setPickedFamily] = useState(rates.families[0] ?? "");
  const family = rates.families.includes(pickedFamily)
    ? pickedFamily
    : (rates.families[0] ?? "");

  const draftSegment = draft?.segment;
  const segmentFixed = !!draftSegment && isBuyerSegment(draftSegment);
  const segment =
    draftSegment && isBuyerSegment(draftSegment) ? draftSegment : pickedSegment;

  const amount = previewAmountOf(amountText);
  const params =
    draft === null
      ? null
      : previewParamsOf({
          segment,
          amountText,
          family,
          draft: draft ?? undefined,
          replacesRuleId,
        });
  const preview = useInstallmentPreview(params);

  const columns = useMemo(() => {
    const ruleLabel = (ruleId: string | null) => {
      if (ruleId === null) return t(`${L}.defaultRule`);
      if (ruleId === DRAFT_RULE_ID) return t(`${L}.draftRule`);
      const rule = rules.find((item) => item.id === ruleId);
      return rule
        ? t("admin.finance.installments.rules.nameVersion", {
            name: rule.name,
            version: rule.version,
          })
        : ruleId;
    };
    return previewColumns(t, ruleLabel);
  }, [rules, t]);

  if (rates.families.length === 0) {
    return <Alert variant="warning">{t(`${L}.unavailable`)}</Alert>;
  }

  const amountError =
    amount.status === "refused"
      ? t("validation.amountFormatRefused")
      : amount.status === "aboveMax"
        ? t("validation.amountAboveMax", { max: PREVIEW_AMOUNT_MAX })
        : amount.status === "empty"
          ? t("validation.enterValidAmount")
          : undefined;

  const data = params ? preview.data : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {segmentFixed ? (
          <Input
            label={t(`${L}.segment`)}
            value={installmentSegmentLabel(t, segment)}
            readOnly
            disabled
          />
        ) : (
          <Select
            label={t(`${L}.segment`)}
            value={segment}
            onChange={(event) =>
              isBuyerSegment(event.target.value) &&
              setPickedSegment(event.target.value)
            }
            options={installmentSegmentOptions(t, INSTALLMENT_BUYER_SEGMENTS)}
          />
        )}
        {/* Text, not type="number": "1.000" is one thousand, never 1 TL. */}
        <Input
          label={t(`${L}.amount`)}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          error={amountError}
        />
        <Select
          label={t(`${L}.family`)}
          value={family}
          onChange={(event) => setPickedFamily(event.target.value)}
          options={rates.families.map((value) => ({ value, label: value }))}
        />
      </div>

      {draftMode && draft === null && (
        <Alert variant="info">{t(`${L}.draftNeedsFix`)}</Alert>
      )}

      {params && preview.isError && (
        <Alert variant="danger" title={t(`${L}.failed`)}>
          {extractErrorMessage(preview.error, t("common.operationFailed"))}
        </Alert>
      )}

      {params && !data && preview.isFetching && (
        <div className="flex justify-center py-6" aria-busy="true">
          <Spinner />
        </div>
      )}

      {data?.reason === "unavailable" && (
        <Alert variant="warning">{t(`${L}.unavailable`)}</Alert>
      )}
      {data?.reason === "card_not_eligible" && (
        <Alert variant="warning">{t(`${L}.cardNotEligible`)}</Alert>
      )}

      {data && !data.reason && (
        <>
          {!rates.fresh && (
            <Alert variant="warning">
              {t(`${L}.staleRates`, {
                fetchedAt: fmtDateTime(data.fetchedAt) ?? "—",
              })}
            </Alert>
          )}
          <DataTable
            columns={columns}
            data={data.rows}
            getRowId={(row) => String(row.count)}
            loading={preview.isFetching}
            dense
          />
        </>
      )}
    </div>
  );
}
