"use client";

import {
  FormModal,
  FormInput,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useTranslations } from "next-intl";
import {
  packageSchema,
  packageToForm,
  packageFormToPayload,
  type PackageFormValues,
  type AdPackage,
} from "../_lib/types";
import { TierRowsEditor } from "../_components/TierRowsEditor";

/** Create/edit an ad package. Mount with `key={pkg?.id ?? 'new'}` for fresh defaults. */
export function PackageFormModal({
  open,
  onClose,
  pkg,
}: {
  open: boolean;
  onClose: () => void;
  pkg?: AdPackage;
}) {
  const t = useTranslations();
  const isEdit = Boolean(pkg);
  const form = useZodForm(packageSchema(t), {
    defaultValues: packageToForm(pkg),
  });

  const save = useAdminMutation(
    (v: PackageFormValues) =>
      isEdit
        ? adminApi.patch(
            `/admin/ad-packages/${pkg!.id}`,
            packageFormToPayload(v),
          )
        : adminApi.post("/admin/ad-packages", packageFormToPayload(v)),
    {
      invalidates: ["ad-packages"],
      successMessage: isEdit
        ? t("admin.marketing.adPackages.updated")
        : t("admin.marketing.adPackages.created"),
      errorMessage: t("admin.marketing.adPackages.saveFailed"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.marketing.adPackages.edit")
          : t("admin.marketing.adPackages.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
      maxWidth="max-w-2xl"
      closeOnBackdrop={false}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormInput
          name="name"
          label={t("admin.marketing.adPackages.name")}
          placeholder={t("admin.marketing.adPackages.namePlaceholder")}
        />
        <FormInput
          name="slug"
          label={t("admin.marketing.adPackages.slug")}
          placeholder={t("admin.marketing.adPackages.slugPlaceholder")}
          helperText={t("admin.marketing.adPackages.slugHelper")}
        />
        <FormInput
          name="sortOrder"
          type="number"
          min="0"
          label={t("admin.marketing.adPackages.sortOrder")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface-alt/40 p-3">
        <FormCheckbox
          name="showcaseOnHome"
          label={t("admin.marketing.adPackages.showcaseOnHomeLabel")}
        />
        <FormCheckbox name="isActive" label={t("common.active")} />
        <p className="basis-full text-xs text-muted">
          {t("admin.marketing.adPackages.showcaseOnHomeHelper")}
        </p>
      </div>

      <div className="border-t border-border pt-4">
        <TierRowsEditor />
      </div>
    </FormModal>
  );
}
