"use client";

import {
  FormModal,
  FormInput,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  pinSchema,
  type PinFormValues,
  type SiteAccessPin,
} from "../_lib/types";

/** Create/edit invite pin. Mount with `key={pin?.id ?? 'new'}` so defaults seed fresh. */
export function PinFormModal({
  open,
  onClose,
  pin,
}: {
  open: boolean;
  onClose: () => void;
  pin?: SiteAccessPin;
}) {
  const t = useTranslations();
  const isEdit = Boolean(pin);

  const form = useZodForm(pinSchema(t), {
    defaultValues: pin
      ? {
          label: pin.label,
          email: pin.email ?? "",
          expiresAt: pin.expiresAt ? pin.expiresAt.slice(0, 10) : "",
          maxUses: pin.maxUses != null ? String(pin.maxUses) : "",
          sendEmail: false,
        }
      : { label: "", email: "", expiresAt: "", maxUses: "", sendEmail: false },
  });

  const save = useAdminMutation(
    (v: PinFormValues) => {
      const payload = {
        label: v.label,
        email: v.email || undefined,
        expiresAt: v.expiresAt
          ? new Date(`${v.expiresAt}T23:59:59`).toISOString()
          : undefined,
        maxUses: v.maxUses ? parseInt(v.maxUses, 10) : undefined,
      };
      return isEdit
        ? adminApi.updateSiteAccessPin(pin!.id, {
            ...payload,
            // PATCH clears omitted-able fields explicitly.
            email: v.email || "",
            expiresAt: v.expiresAt
              ? new Date(`${v.expiresAt}T23:59:59`).toISOString()
              : null,
            maxUses: v.maxUses ? parseInt(v.maxUses, 10) : null,
          })
        : adminApi.createSiteAccessPin({
            ...payload,
            sendEmail: v.sendEmail && Boolean(v.email),
          });
    },
    {
      invalidates: ["site-access-pins"],
      successMessage: isEdit
        ? t("admin.earlyAccess.toasts.updated")
        : t("admin.earlyAccess.toasts.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.earlyAccess.modal.editTitle")
          : t("admin.earlyAccess.modal.createTitle")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
    >
      <FormInput
        name="label"
        label={t("admin.earlyAccess.modal.label")}
        placeholder={t("admin.earlyAccess.modal.labelPlaceholder")}
      />
      <FormInput
        name="email"
        label={t("admin.earlyAccess.modal.email")}
        type="email"
        placeholder="ornek@eposta.com"
      />
      <div className="flex gap-4">
        <div className="flex-1">
          <FormInput
            name="expiresAt"
            label={t("admin.earlyAccess.modal.expiresAt")}
            type="date"
          />
        </div>
        <div className="flex-1">
          <FormInput
            name="maxUses"
            label={t("admin.earlyAccess.modal.maxUses")}
            type="number"
            min={1}
            helperText={t("admin.earlyAccess.modal.maxUsesHint")}
          />
        </div>
      </div>
      {!isEdit && (
        <FormCheckbox
          name="sendEmail"
          label={t("admin.earlyAccess.modal.sendEmailNow")}
        />
      )}
    </FormModal>
  );
}
