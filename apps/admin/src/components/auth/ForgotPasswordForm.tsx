"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { useForgotPassword } from "@/hooks/useForgotPassword";
import { AuthCard } from "./AuthCard";

export function ForgotPasswordForm() {
  const t = useTranslations();
  const { submit, sent } = useForgotPassword();
  const form = useZodForm(forgotPasswordSchema(t), {
    defaultValues: { email: "" },
  });

  return (
    <AuthCard
      title={t("admin.auth.forgotPassword.title")}
      // Yönerge, mağaza tarafındaki ekranlarla aynı yerde: başlığın hemen
      // altında açıklama satırı olarak. Eskiden formun içinde ayrı bir
      // paragraftı ve başlıkla arasında kart dolgusu vardı.
      description={t("admin.auth.forgotPassword.instructions")}
      backHref="/login"
      backLabel={t("admin.auth.forgotPassword.backToLogin")}
    >
      {sent ? (
        <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700">
          {t.rich("admin.auth.forgotPassword.sentMessage", {
            email: form.getValues("email"),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
      ) : (
        <Form
          form={form}
          onSubmit={(values) => submit(values.email)}
          className="space-y-6"
        >
          <FormInput
            name="email"
            label={t("common.email")}
            type="email"
            placeholder="admin@tarodan.com"
          />
          <Button
            type="submit"
            size="lg"
            isLoading={form.formState.isSubmitting}
            className="w-full"
          >
            {t("admin.auth.forgotPassword.submit")}
          </Button>
        </Form>
      )}
    </AuthCard>
  );
}
