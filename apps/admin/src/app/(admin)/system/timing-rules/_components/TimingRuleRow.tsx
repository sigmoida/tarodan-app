"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import { FormInput, FormSelect } from "@tarodan/ui/form";
import {
  timingRule,
  type AdminTimingRuleState,
  type TimingRuleId,
} from "@tarodan/types";
import { fmtDateTime } from "@/lib/format";
import {
  actionField,
  actionOptions,
  boundsLabel,
  isActionLocked,
  valueField,
} from "../_lib/timing-rules";

interface TimingRuleRowProps {
  id: TimingRuleId;
  state: AdminTimingRuleState | undefined;
  canEdit: boolean;
}

/**
 * Tek süre satırı: değer (kaydın biriminde), süre dolunca uygulanacak eylem
 * ve yardım satırı (ne işe yaradığı + sınırlar + değerin şu an nereden
 * geldiği). Tek eylemli kayıtta seçici kilitlidir.
 */
export function TimingRuleRow({ id, state, canEdit }: TimingRuleRowProps) {
  const t = useTranslations();
  const rule = timingRule(id);
  const label = t(`admin.timingRules.rules.${id}.label`);
  const source = state?.source ?? "default";

  return (
    <div className="grid grid-cols-1 gap-4 border-b border-border py-4 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-heading">{label}</p>
          <Badge variant={source === "setting" ? "primary" : "secondary"}>
            {t(`admin.timingRules.source.${source}`)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {t(`admin.timingRules.rules.${id}.helper`)}
        </p>
        <p className="mt-1 text-xs text-subtle">
          {boundsLabel(t, id)}
          {source === "env" && rule.envKey
            ? ` · ${t("admin.timingRules.envFallback", { envKey: rule.envKey })}`
            : ""}
          {state?.updatedAt
            ? ` · ${t("admin.timingRules.updatedAt", { date: fmtDateTime(state.updatedAt) ?? "" })}`
            : ""}
        </p>
        {state?.outOfBounds && (
          <p className="mt-1 text-xs font-medium text-danger-700">
            {t("admin.timingRules.outOfBoundsWarning")}
          </p>
        )}
        {rule.appliesToInProgress && (
          <p className="mt-1 text-xs text-warning-800">
            {t("admin.timingRules.appliesToInProgressWarning")}
          </p>
        )}
      </div>
      <FormInput
        name={valueField(id)}
        type="number"
        inputMode="numeric"
        label={t(`admin.timingRules.units.${rule.unit}`)}
        min={rule.min}
        max={rule.max}
        step={1}
        disabled={!canEdit}
      />
      <FormSelect
        name={actionField(id)}
        label={t("admin.timingRules.onExpiry")}
        options={actionOptions(t, id)}
        disabled={!canEdit || isActionLocked(id)}
      />
    </div>
  );
}
