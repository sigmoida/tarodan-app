"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useZodForm } from "@tarodan/ui/form";
import { useAuthStore } from "@/stores/authStore";
import { supportApi } from "@/lib/api";
import { useWebItem } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import { useTranslations } from "next-intl";
import { replySchema, type ReplyValues } from "../../_lib/schema";
import type { TicketDetail } from "../../_lib/data";

const RESOURCE = "support-ticket";

/** Support ticket detail — the ticket query + the reply RHF/zod form & mutation. */
export function useTicketDetail() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) router.push(`/login?redirect=/support/${ticketId}`);
  }, [authLoading, isAuthenticated, ticketId, router]);

  const ticketQuery = useWebItem<TicketDetail>({
    resource: RESOURCE,
    id: ticketId,
    fetcher: async (id) => (await supportApi.getTicket(id)).data,
    enabled: !authLoading && isAuthenticated && !!ticketId,
    query: { meta: { page: "support-ticket" } },
  });

  useEffect(() => {
    if (ticketQuery.isError) {
      toast.error(
        (ticketQuery.error as any)?.response?.data?.message ||
          t("support.ticketLoadFailed"),
      );
      router.push("/support");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketQuery.isError]);

  const form = useZodForm(replySchema, { defaultValues: { reply: "" } });

  const reply = useWebMutation(
    (values: ReplyValues) =>
      supportApi.addMessage(ticketId, { content: values.reply.trim() }),
    {
      invalidates: [RESOURCE],
      errorMessage: t("support.messageSendFailed"),
      onSuccess: () => form.reset({ reply: "" }),
    },
  );

  return {
    ticket: ticketQuery.data ?? null,
    loading: ticketQuery.isLoading || authLoading,
    form,
    onSubmit: (values: ReplyValues) => reply.mutate(values),
    isSending: reply.isPending,
  };
}
