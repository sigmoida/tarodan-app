"use client";

import { useState } from "react";
import {
  FormModal,
  FormInput,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { LocaleTabs } from "@/components/form/LocaleTabs";
import { localizedKey, type LocaleLang } from "@/lib/localized-form";
import {
  TRUST_BADGE_LOCALIZED_FIELDS,
  emptyTrustBadgeForm,
  iconOptions,
  trustBadgeFormToPayload,
  trustBadgeSchema,
  trustBadgeToForm,
  type TrustBadge,
  type TrustBadgeFormValues,
} from "../_lib/types";

/** Create/edit trust badge. Mount with `key={badge?.id ?? 'new'}`. */
export function TrustBadgeFormModal({
  open,
  onClose,
  badge,
}: {
  open: boolean;
  onClose: () => void;
  badge?: TrustBadge;
}) {
  const t = useTranslations();
  const isEdit = Boolean(badge);
  const [lang, setLang] = useState<LocaleLang>("tr");
  const form = useZodForm(trustBadgeSchema(t), {
    defaultValues: badge ? trustBadgeToForm(badge) : emptyTrustBadgeForm,
  });

  const save = useAdminMutation(
    (v: TrustBadgeFormValues) =>
      isEdit
        ? adminApi.updateTrustBadge(
            badge!.id,
            trustBadgeFormToPayload(v, "update"),
          )
        : adminApi.createTrustBadge(trustBadgeFormToPayload(v, "create")),
    {
      invalidates: ["trust-badges"],
      successMessage: isEdit
        ? t("admin.marketing.trustBadges.updated")
        : t("admin.marketing.trustBadges.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.marketing.trustBadges.edit")
          : t("admin.marketing.trustBadges.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
    >
      <FormSelect
        name="icon"
        label={t("admin.marketing.trustBadges.columns.icon")}
        options={iconOptions()}
      />
      <LocaleTabs
        bases={TRUST_BADGE_LOCALIZED_FIELDS}
        value={lang}
        onChange={setLang}
      >
        {(l) => (
          <div className="space-y-4">
            <FormInput
              key={localizedKey("title", l)}
              name={localizedKey("title", l)}
              label={t("common.title")}
            />
            <FormInput
              key={localizedKey("description", l)}
              name={localizedKey("description", l)}
              label={t("common.description")}
              helperText={t("admin.marketing.trustBadges.tokensHint")}
            />
          </div>
        )}
      </LocaleTabs>
      <FormCheckbox
        name="hideOnIos"
        label={
          <span>
            {t("admin.marketing.hero.hideOnIos")}
            <span className="block text-xs text-muted">
              {t("admin.marketing.hero.hideOnIosHint")}
            </span>
          </span>
        }
      />
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}
