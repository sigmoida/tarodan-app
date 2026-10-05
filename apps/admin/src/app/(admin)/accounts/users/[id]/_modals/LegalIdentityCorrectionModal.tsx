"use client";

import { useTranslations } from "next-intl";
import {
  FormInput,
  FormModal,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import type { LegalIdentityValues } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  correctionPayload,
  legalIdentityCorrectionSchema,
  type LegalIdentityCorrectionValues,
} from "../_lib/legalIdentity";

/**
 * Admin yasal kimlik düzeltmesi. Üye kimliğini bir kez girer ve
 * değiştiremez; yanlışlık yalnız buradan, zorunlu gerekçeyle düzeltilir.
 * Sunucu aynı doğrulamayı ve TCKN tekilliğini uygular, değişikliği denetim
 * kaydına (maskeli) yazar.
 */
export function LegalIdentityCorrectionModal({
  open,
  onClose,
  userId,
  current,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  current: LegalIdentityValues;
}) {
  const t = useTranslations();
  const form = useZodForm(legalIdentityCorrectionSchema(t), {
    defaultValues: {
      legalFirstName: current.legalFirstName ?? "",
      legalLastName: current.legalLastName ?? "",
      nationalId: current.nationalId ?? "",
      reason: "",
    },
  });
  const save = useAdminMutation(
    (values: LegalIdentityCorrectionValues) =>
      adminApi.correctUserLegalIdentity(
        userId,
        correctionPayload(values, current),
      ),
    {
      invalidates: ["users"],
      successMessage: t("admin.users.legalIdentity.saved"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.users.legalIdentity.correctTitle")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      isSubmitting={save.isPending}
      submitLabel={t("admin.users.legalIdentity.correct")}
    >
      <p className="text-sm text-muted">
        {t("admin.users.legalIdentity.correctHint")}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput name="legalFirstName" label={t("identity.legalFirstName")} />
        <FormInput name="legalLastName" label={t("identity.legalLastName")} />
      </div>
      <FormInput
        name="nationalId"
        label={t("identity.nationalId")}
        inputMode="numeric"
        autoComplete="off"
        maxLength={11}
        className="font-mono"
      />
      <FormTextarea
        name="reason"
        label={t("admin.users.legalIdentity.reasonLabel")}
        placeholder={t("admin.users.legalIdentity.reasonPlaceholder")}
        rows={3}
      />
    </FormModal>
  );
}
