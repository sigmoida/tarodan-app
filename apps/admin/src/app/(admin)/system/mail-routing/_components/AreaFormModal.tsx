"use client";

import { useTranslations } from "next-intl";
import { FormInput, FormModal, FormSelect, useZodForm } from "@tarodan/ui/form";
import type {
  MailAreaState,
  MailSenderAccountView,
} from "@/lib/api/mail-routing.types";
import {
  areaLabel,
  areaSchema,
  areaSenderUpdate,
  areaToFormValues,
  senderOptions,
  type AreaFormValues,
} from "../_lib/mail-routing";
import { useAreaUpdate } from "../_lib/useMailRoutingPage";

/** Bir alanın müşteri postası kimliği: gönderen hesap, görünen ad, yanıt adresi. */
export function AreaFormModal({
  open,
  onClose,
  area,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  area: MailAreaState;
  accounts: readonly MailSenderAccountView[];
}) {
  const t = useTranslations();
  const form = useZodForm(areaSchema(t), {
    defaultValues: areaToFormValues(area),
  });
  const save = useAreaUpdate({ onSuccess: onClose });

  const submit = (values: AreaFormValues) => {
    const update = areaSenderUpdate(values, area);
    if (update) save.mutate({ areaId: area.id, update });
    else onClose();
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.mailRouting.areasTab.editTitle", {
        area: areaLabel(t, area.id),
      })}
      form={form}
      onSubmit={submit}
      isSubmitting={save.isPending}
      submitLabel={t("common.save")}
    >
      <FormSelect
        name="senderAccountId"
        label={t("admin.mailRouting.areasTab.form.sender")}
        options={senderOptions(t, accounts)}
      />
      <FormInput
        name="displayName"
        label={t("admin.mailRouting.areasTab.form.displayName")}
        helperText={t("admin.mailRouting.areasTab.form.displayNameHelper")}
      />
      <FormInput
        name="replyTo"
        type="email"
        label={t("admin.mailRouting.areasTab.form.replyTo")}
        helperText={t("admin.mailRouting.areasTab.form.replyToHelper")}
      />
    </FormModal>
  );
}
