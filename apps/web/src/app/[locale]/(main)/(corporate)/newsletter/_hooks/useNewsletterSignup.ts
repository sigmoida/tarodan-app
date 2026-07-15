"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useZodForm } from "@tarodan/ui/form";
import { api } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { useWebMutation } from "@/hooks/useWebMutation";
import { newsletterSchema, type NewsletterValues } from "../_lib/schema";

/** Newsletter signup — RHF+zod form + subscribe mutation (owns toasts). */
export function useNewsletterSignup() {
  const t = useTranslations();
  const locale = useLocale();
  const [success, setSuccess] = useState(false);
  const form = useZodForm(newsletterSchema(locale), {
    defaultValues: { email: "", newsletter: true, promotions: true },
  });

  const subscribe = useWebMutation(
    (values: NewsletterValues) =>
      api.post("/newsletter/subscribe", {
        email: values.email,
        newsletter: values.newsletter,
        promotions: values.promotions,
      }),
    {
      errorMessage: t("marketing.newsletter.subscriptionFailed"),
      onSuccess: ({ data }) => {
        setSuccess(true);
        toast.success(data.message);
      },
    },
  );

  return {
    form,
    onSubmit: (values: NewsletterValues) => subscribe.mutate(values),
    isSubmitting: subscribe.isPending,
    success,
  };
}
