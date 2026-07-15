"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useZodForm } from "@tarodan/ui/form";
import { api } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { useWebItem } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import { unsubscribeSchema, type UnsubscribeValues } from "../_lib/schema";

/**
 * Newsletter unsubscribe. A `token` in the URL triggers a one-shot GET (link
 * flow); the email form is an RHF+zod form + mutation. Loading/success/error
 * derive from the query + mutation state.
 */
export function useUnsubscribe() {
  const locale = useLocale();
  const token = useSearchParams().get("token");

  const tokenQuery = useWebItem<{ message?: string }>({
    resource: "newsletter-unsubscribe",
    id: token ?? "",
    fetcher: async (id) =>
      (await api.get(`/newsletter/unsubscribe?token=${encodeURIComponent(id)}`))
        .data,
    enabled: !!token,
    query: { retry: false, meta: { page: "newsletter-unsubscribe" } },
  });

  useEffect(() => {
    if (tokenQuery.isSuccess)
      toast.success(
        tokenQuery.data?.message ??
          (locale === "en" ? "Unsubscribed" : "Abonelikten çıkıldı"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenQuery.isSuccess]);
  useEffect(() => {
    if (tokenQuery.isError)
      toast.error(
        (tokenQuery.error as any)?.response?.data?.message ||
          (locale === "en"
            ? "Invalid or expired link"
            : "Geçersiz veya süresi dolmuş link"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenQuery.isError]);

  const form = useZodForm(unsubscribeSchema(locale), {
    defaultValues: { email: "", feedback: "" },
  });

  const emailUnsub = useWebMutation(
    (values: UnsubscribeValues) =>
      api.post("/newsletter/unsubscribe", { email: values.email }),
    {
      errorMessage: locale === "en" ? "Request failed" : "İstek başarısız",
      onSuccess: ({ data }) => toast.success(data.message),
    },
  );

  return {
    form,
    onSubmit: (values: UnsubscribeValues) => emailUnsub.mutate(values),
    processing: !!token && tokenQuery.isLoading,
    unsubscribed: tokenQuery.isSuccess || emailUnsub.isSuccess,
    isSubmitting: emailUnsub.isPending,
  };
}
