"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import { FormInput, FormModal, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import type {
  MailAccountTestResult,
  MailSenderAccountView,
} from "@/lib/api/mail-routing.types";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { testSendSchema } from "../_lib/mail-routing";
import { MAIL_ROUTING_RESOURCE } from "../_lib/useMailRoutingPage";

/**
 * "Test gönder": alıcı adresi sorulur, hesap üzerinden gerçekten bir deneme
 * postası gider; sonuç (başarılı ya da sunucunun hata metni) modalda kalır.
 * Sonuç hesabın "son test" alanına da yazılır, bu yüzden liste tazelenir.
 */
export function AccountTestModal({
  open,
  onClose,
  account,
}: {
  open: boolean;
  onClose: () => void;
  account: MailSenderAccountView;
}) {
  const t = useTranslations();
  const [result, setResult] = useState<MailAccountTestResult | null>(null);
  const form = useZodForm(testSendSchema(t), { defaultValues: { to: "" } });

  const send = useAdminMutation(
    async (values: { to: string }) => {
      const response = await adminApi.testMailAccount(
        account.id,
        values.to.trim().toLowerCase(),
      );
      return response.data as MailAccountTestResult;
    },
    {
      invalidates: [MAIL_ROUTING_RESOURCE],
      onSuccess: setResult,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.mailRouting.accountsTab.test.title", {
        address: account.address,
      })}
      form={form}
      onSubmit={(values) => {
        setResult(null);
        send.mutate(values);
      }}
      isSubmitting={send.isPending}
      submitLabel={t("admin.mailRouting.accountsTab.test.send")}
    >
      <FormInput
        name="to"
        type="email"
        label={t("admin.mailRouting.accountsTab.test.to")}
        helperText={t("admin.mailRouting.accountsTab.test.toHelper")}
      />
      {result && (
        <Alert variant={result.ok ? "success" : "danger"}>
          {result.ok
            ? t("admin.mailRouting.accountsTab.test.ok")
            : t("admin.mailRouting.accountsTab.test.failed", {
                error: result.error ?? "",
              })}
        </Alert>
      )}
    </FormModal>
  );
}
