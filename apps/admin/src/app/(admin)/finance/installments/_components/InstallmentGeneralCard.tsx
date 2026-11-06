"use client";

import { useTranslations } from "next-intl";
import { Button, Toggle } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import {
  INSTALLMENT_SETTINGS,
  type AdminInstallmentSettings,
} from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { useConfirm } from "@/provider/ConfirmProvider";
import { extractErrorI18nKey, extractErrorMessage } from "@/lib/error";
import { fmtTry } from "@/lib/format";
import { useInstallmentSettingsWrites } from "../_hooks/useInstallmentSettings";
import {
  isMinAmountErrorKey,
  minAmountFormValues,
  minAmountSchema,
  type MinAmountFormValues,
} from "../_lib/settings-form";

const L = "admin.finance.installments.general";

/**
 * The master switch (`installments_enabled`, the kill switch) and the
 * minimum amount. Turning the switch either way asks first: on is the last
 * step of a release ("flags last"), off stops new installment payments.
 * Read-only for everyone but super_admin.
 */
export function InstallmentGeneralCard({
  settings,
  canEdit,
}: {
  settings: AdminInstallmentSettings;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const { enable, disable, saveMinAmount } = useInstallmentSettingsWrites();
  const switching = enable.isPending || disable.isPending;

  // `values` follows the stored amount (it resets only when that changes).
  const form = useZodForm(minAmountSchema(t), {
    values: minAmountFormValues(settings.minAmount),
  });

  const onSwitch = (next: boolean) => {
    void confirm(
      next
        ? {
            title: t(`${L}.enableConfirm.title`),
            description: (
              <div className="space-y-2">
                <p>{t(`${L}.enableConfirm.description`)}</p>
                {!settings.rates.fresh && (
                  <p>{t(`${L}.enableConfirm.staleRates`)}</p>
                )}
              </div>
            ),
            confirmLabel: t(`${L}.enableConfirm.confirm`),
            cancelLabel: t("common.cancel"),
            onConfirm: () => enable.mutateAsync(undefined),
          }
        : {
            title: t(`${L}.disableConfirm.title`),
            description: t(`${L}.disableConfirm.description`),
            confirmLabel: t(`${L}.disableConfirm.confirm`),
            cancelLabel: t("common.cancel"),
            destructive: true,
            onConfirm: () => disable.mutateAsync(undefined),
          },
    );
  };

  const onSaveMinAmount = (values: MinAmountFormValues) =>
    saveMinAmount.mutate(values, {
      // The saved amount may be the stored one written differently
      // ("500,00"), which `values` would not reset: reset to what was saved.
      onSuccess: (saved) => form.reset(minAmountFormValues(saved.minAmount)),
      onError: (error) => {
        if (isMinAmountErrorKey(extractErrorI18nKey(error))) {
          form.setError("minAmount", {
            message: extractErrorMessage(error, t("common.operationFailed")),
          });
        }
      },
    });

  return (
    <SectionCard title={t(`${L}.title`)} bodyClassName="space-y-6">
      <div className="space-y-2">
        <SectionTitle size="sm">{t(`${L}.enabledLabel`)}</SectionTitle>
        <div className="flex items-center gap-3">
          <Toggle
            checked={settings.enabled}
            onChange={onSwitch}
            disabled={!canEdit || switching}
            label={t(`${L}.enabledLabel`)}
          />
          <span className="text-sm font-medium text-heading">
            {settings.enabled ? t(`${L}.enabledOn`) : t(`${L}.enabledOff`)}
          </span>
        </div>
        <p className="text-sm text-muted">{t(`${L}.enabledHint`)}</p>
      </div>

      <Form form={form} onSubmit={onSaveMinAmount} className="space-y-3">
        {/* Text, not type="number": "1.000" is one thousand, never 1 TL. */}
        <FormInput
          name="minAmount"
          label={t(`${L}.minAmountLabel`)}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={!canEdit}
          helperText={t(`${L}.minAmountHint`, {
            amount: fmtTry(INSTALLMENT_SETTINGS.minAmount.default) ?? "",
          })}
        />
        {canEdit && (
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              isLoading={saveMinAmount.isPending}
              disabled={!form.formState.isDirty}
            >
              {t(`${L}.minAmountSave`)}
            </Button>
          </div>
        )}
      </Form>
    </SectionCard>
  );
}
