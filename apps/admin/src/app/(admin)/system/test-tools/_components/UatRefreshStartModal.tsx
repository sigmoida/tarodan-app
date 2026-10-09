"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import {
  FormCheckbox,
  FormInput,
  FormModal,
  useZodForm,
} from "@tarodan/ui/form";
import {
  UAT_REFRESH_FORM_DEFAULTS,
  uatRefreshSchema,
  type UatRefreshFormValues,
} from "../_lib/uatRefreshSchema";

/**
 * Canlıdan yenileme onayı. Ne olacağı düz yazıyla söylenir (veri değişir,
 * sonradan oluşan her şey silinir, site kapalı kalır); "STAGING" yazılmadan
 * gönderilemez. "Deneme modu" hiçbir şeyi değiştirmeden hattı dener.
 */
export function UatRefreshStartModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: UatRefreshFormValues) => void;
  isSubmitting: boolean;
}) {
  const t = useTranslations();
  const form = useZodForm(uatRefreshSchema(t), {
    defaultValues: UAT_REFRESH_FORM_DEFAULTS,
  });

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.system.testTools.uatRefresh.modal.title")}
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitLabel={t("admin.system.testTools.uatRefresh.modal.submit")}
      destructive
      resetValues={UAT_REFRESH_FORM_DEFAULTS}
    >
      <p className="text-sm text-muted">
        {t("admin.system.testTools.uatRefresh.modal.lead")}
      </p>
      <Alert variant="warning">
        <ul className="list-inside list-disc space-y-1">
          <li>{t("admin.system.testTools.uatRefresh.modal.replace")}</li>
          <li>{t("admin.system.testTools.uatRefresh.modal.wipe")}</li>
          <li>{t("admin.system.testTools.uatRefresh.modal.accounts")}</li>
          <li>{t("admin.system.testTools.uatRefresh.modal.downtime")}</li>
        </ul>
      </Alert>
      <FormInput
        name="confirm"
        label={t("admin.system.testTools.uatRefresh.modal.confirmLabel")}
        autoComplete="off"
        disabled={isSubmitting}
      />
      <FormCheckbox
        name="dryRun"
        label={t("admin.system.testTools.uatRefresh.modal.dryRun")}
        disabled={isSubmitting}
      />
    </FormModal>
  );
}
