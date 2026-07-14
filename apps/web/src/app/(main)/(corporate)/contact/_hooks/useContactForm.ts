"use client";

import toast from "react-hot-toast";
import { useZodForm } from "@tarodan/ui/form";
import { supportApi } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { useWebMutation } from "@/hooks/useWebMutation";
import { contactSchema, type ContactValues } from "../_lib/schema";

const EMPTY: ContactValues = { name: "", email: "", subject: "", message: "" };

/** Guest contact — RHF+zod form + the send mutation (owns success/error toasts). */
export function useContactForm() {
  const t = useTranslations();
  const locale = useLocale();
  const form = useZodForm(contactSchema(locale), { defaultValues: EMPTY });

  const send = useWebMutation(
    (values: ContactValues) =>
      supportApi.guestContact({
        name: values.name,
        email: values.email,
        subject: values.subject || undefined,
        message: values.message,
      }),
    {
      errorMessage: t("common.operationFailed"),
      onSuccess: (response) => {
        toast.success(response.data.message || t("contact.success"));
        form.reset(EMPTY);
      },
    },
  );

  return {
    form,
    onSubmit: (values: ContactValues) => send.mutate(values),
    isSending: send.isPending,
  };
}
