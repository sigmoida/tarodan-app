"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { Alert } from "@tarodan/ui";
import {
  FormCheckbox,
  FormDateTimePicker,
  FormInput,
  FormModal,
  FormSelect,
  useZodForm,
} from "@tarodan/ui/form";
import {
  INSTALLMENT_RULE_NAME_MAX,
  type AdminInstallmentRatesInfo,
  type AdminInstallmentRule,
  type AdminInstallmentRuleRef,
} from "@tarodan/types";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import { extractErrorI18nKey, extractErrorMessage } from "@/lib/error";
import {
  isStaleRuleError,
  useInstallmentRuleWrite,
} from "../_hooks/useInstallmentRules";
import { InstallmentPreview } from "../_components/InstallmentPreview";
import { OverlapWarning } from "../_components/OverlapWarning";
import { overlappingRules } from "../_lib/overlaps";
import {
  draftOfRuleForm,
  emptyRuleForm,
  installmentCountOptions,
  parseRuleForm,
  ruleFieldOfErrorKey,
  ruleFormSchema,
  ruleToForm,
  type InstallmentRuleFormValues,
} from "../_lib/rule-form";
import { installmentSegmentOptions } from "../_lib/segments";

const L = "admin.finance.installments.form";

/**
 * Create a rule, or save the next version of `rule` (the API archives it
 * and inserts the next version in one step). The shared validator checks
 * every field; the live overlap warning and the draft price preview use the
 * same shared functions the API runs. A version that is no longer current
 * (409) is said in the form and the list reloads behind it.
 */
export function InstallmentRuleFormModal({
  rule,
  rules,
  rates,
  onClose,
  onSaved,
}: {
  rule?: AdminInstallmentRule;
  rules: readonly AdminInstallmentRule[];
  rates: AdminInstallmentRatesInfo;
  onClose: () => void;
  onSaved: (overlaps: AdminInstallmentRuleRef[]) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const modalLabels = useFormModalLabels();
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const write = useInstallmentRuleWrite(rule);

  const form = useZodForm(ruleFormSchema(t), {
    defaultValues: rule ? ruleToForm(rule) : emptyRuleForm(),
  });
  const values = useWatch({
    control: form.control,
  }) as InstallmentRuleFormValues;
  const allowed = values.allowed;
  const draft = draftOfRuleForm(values);
  const liveOverlaps = overlappingRules(
    parseRuleForm(values),
    rules,
    rule?.lineageId,
  );

  const onSubmit = (submitted: InstallmentRuleFormValues) => {
    if (staleMessage) return;
    write.mutate(parseRuleForm(submitted), {
      onSuccess: (result) => onSaved(result.overlaps),
      onError: (error) => {
        const message = extractErrorMessage(error, t("common.operationFailed"));
        if (isStaleRuleError(error)) {
          setStaleMessage(message);
          return;
        }
        const field = ruleFieldOfErrorKey(extractErrorI18nKey(error));
        if (field) form.setError(field, { message });
      },
    });
  };

  const countOptions = installmentCountOptions();
  const pickerLabels = {
    locale,
    todayLabel: t("common.today"),
    clearLabel: t("common.clear"),
    timeLabel: t(`${L}.timeLabel`),
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title={
        rule
          ? t(`${L}.versionTitle`, { name: rule.name, version: rule.version })
          : t(`${L}.createTitle`)
      }
      form={form}
      onSubmit={onSubmit}
      isSubmitting={write.isPending}
      submitLabel={rule ? t(`${L}.submitVersion`) : t(`${L}.submitCreate`)}
      submitDisabled={!!staleMessage}
      size="wide"
      closeOnBackdrop={false}
      {...modalLabels}
    >
      {staleMessage && <Alert variant="danger">{staleMessage}</Alert>}
      {rule && !staleMessage && (
        <Alert variant="info">{t(`${L}.versionHint`)}</Alert>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormInput
          name="name"
          label={t(`${L}.name`)}
          maxLength={INSTALLMENT_RULE_NAME_MAX}
          autoComplete="off"
        />
        <FormSelect
          name="segment"
          label={t(`${L}.segment`)}
          options={installmentSegmentOptions(t)}
        />
        <FormSelect
          name="minCount"
          label={t(`${L}.minCount`)}
          options={countOptions}
        />
        <FormSelect
          name="maxCount"
          label={t(`${L}.maxCount`)}
          options={countOptions}
        />
        <div className="space-y-1 md:col-span-2">
          <FormCheckbox name="allowed" label={t(`${L}.allowed`)} />
          <p className="text-sm text-muted">{t(`${L}.allowedHint`)}</p>
        </div>
        <FormInput
          name="platformSharePct"
          label={t(`${L}.share`)}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={!allowed}
          helperText={t(`${L}.shareHint`)}
        />
        <FormInput
          name="priority"
          label={t(`${L}.priority`)}
          type="text"
          autoComplete="off"
          helperText={t(`${L}.priorityHint`)}
        />
        <FormDateTimePicker
          id="installment-rule-valid-from"
          name="validFrom"
          label={t(`${L}.validFrom`)}
          helperText={t(`${L}.timeZoneHint`)}
          {...pickerLabels}
        />
        <FormDateTimePicker
          id="installment-rule-valid-until"
          name="validUntil"
          label={t(`${L}.validUntil`)}
          helperText={t(`${L}.validUntilHint`)}
          {...pickerLabels}
        />
      </div>

      {liveOverlaps.length > 0 && <OverlapWarning overlaps={liveOverlaps} />}

      <Panel tone="muted" className="space-y-3">
        <div>
          <SectionTitle size="sm">
            {t("admin.finance.installments.preview.title")}
          </SectionTitle>
          <p className="text-sm text-muted">
            {t("admin.finance.installments.preview.draftDescription")}
          </p>
        </div>
        <InstallmentPreview
          rates={rates}
          rules={rules}
          draft={draft}
          replacesRuleId={rule?.id}
        />
      </Panel>
    </FormModal>
  );
}
