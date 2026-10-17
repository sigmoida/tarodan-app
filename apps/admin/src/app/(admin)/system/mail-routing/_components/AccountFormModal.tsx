"use client";

import { useState } from "react";
import type { z } from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { FormInput, FormModal, FormSelect, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import type { MailSenderAccountView } from "@/lib/api/mail-routing.types";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  accountCreatePayload,
  accountPatchPayload,
  accountSchema,
  accountToFormValues,
  emptyAccountValues,
  type AccountFormValues,
} from "../_lib/mail-routing";
import { MAIL_ROUTING_RESOURCE } from "../_lib/useMailRoutingPage";

/**
 * Gönderen hesap ekle / düzenle. Düzenlemede parola alanı boş gelir (saklı
 * parola ASLA gösterilmez); boş bırakmak mevcut parolayı korur. Sunucu, ana
 * bilgisayar / port / güvenli bağlantı boşken varsayılan SMTP ayarını kullanır.
 */
export function AccountFormModal({
  open,
  onClose,
  account,
}: {
  open: boolean;
  onClose: () => void;
  account?: MailSenderAccountView;
}) {
  const t = useTranslations();
  const isEdit = Boolean(account);
  const [showAdvanced, setShowAdvanced] = useState(
    account
      ? Boolean(account.host) ||
          account.port !== null ||
          account.secure !== null
      : false,
  );
  const form = useZodForm(accountSchema(t, isEdit), {
    // Şema çıktısı `secure` alanını dar birleşim olarak üretir; form değerleri
    // aynı üç metinden biridir.
    defaultValues: (account
      ? accountToFormValues(account)
      : emptyAccountValues) as z.infer<ReturnType<typeof accountSchema>>,
  });

  const save = useAdminMutation(
    (values: AccountFormValues) => {
      if (!account) {
        return adminApi.createMailAccount(accountCreatePayload(values));
      }
      const patch = accountPatchPayload(values, account);
      return patch
        ? adminApi.updateMailAccount(account.id, patch)
        : Promise.resolve(null);
    },
    {
      invalidates: [MAIL_ROUTING_RESOURCE],
      successMessage: isEdit
        ? t("admin.mailRouting.accountsTab.updated")
        : t("admin.mailRouting.accountsTab.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.mailRouting.accountsTab.editTitle")
          : t("admin.mailRouting.accountsTab.addTitle")
      }
      form={form}
      onSubmit={(values) => save.mutate(values as AccountFormValues)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.add")}
    >
      <FormInput
        name="address"
        type="email"
        label={t("admin.mailRouting.accountsTab.form.address")}
        placeholder="siparis@tarodan.com.tr"
      />
      <FormInput
        name="displayName"
        label={t("admin.mailRouting.accountsTab.form.displayName")}
        helperText={t("admin.mailRouting.accountsTab.form.displayNameHelper")}
      />
      <FormInput
        name="password"
        type="password"
        autoComplete="new-password"
        label={t("admin.mailRouting.accountsTab.form.password")}
        placeholder={
          isEdit
            ? t("admin.mailRouting.accountsTab.form.passwordKeep")
            : undefined
        }
        helperText={
          isEdit
            ? t("admin.mailRouting.accountsTab.form.passwordEditHelper")
            : undefined
        }
      />
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced((value) => !value)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced
            ? t("admin.mailRouting.accountsTab.form.hideAdvanced")
            : t("admin.mailRouting.accountsTab.form.showAdvanced")}
        </Button>
      </div>
      {showAdvanced && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {t("admin.mailRouting.accountsTab.form.advancedNote")}
          </p>
          <FormInput
            name="username"
            label={t("admin.mailRouting.accountsTab.form.username")}
            helperText={t("admin.mailRouting.accountsTab.form.usernameHelper")}
          />
          <FormInput
            name="host"
            label={t("admin.mailRouting.accountsTab.form.host")}
            placeholder="smtp.example.com"
          />
          <FormInput
            name="port"
            type="number"
            inputMode="numeric"
            label={t("admin.mailRouting.accountsTab.form.port")}
            placeholder="587"
          />
          <FormSelect
            name="secure"
            label={t("admin.mailRouting.accountsTab.form.secure")}
            options={[
              {
                value: "",
                label: t("admin.mailRouting.accountsTab.form.secureDefault"),
              },
              {
                value: "true",
                label: t("admin.mailRouting.accountsTab.form.secureOn"),
              },
              {
                value: "false",
                label: t("admin.mailRouting.accountsTab.form.secureOff"),
              },
            ]}
          />
        </div>
      )}
    </FormModal>
  );
}
