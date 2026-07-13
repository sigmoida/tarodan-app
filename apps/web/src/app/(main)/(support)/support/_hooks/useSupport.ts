"use client";

import { useEffect, useState } from "react";
import { useZodForm } from "@tarodan/ui/form";
import { useAuthStore } from "@/stores/authStore";
import { supportApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import { ticketSchema, type TicketValues } from "../_lib/schema";
import type { Ticket } from "../_lib/data";

const RESOURCE = "support-tickets";

/**
 * Support center — my-tickets query + create-ticket RHF/zod form & mutation.
 * A `?orderId` in the URL (order → "report issue") prefills and opens the form.
 */
export function useSupport() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [orderId, setOrderId] = useState<string | undefined>();

  const form = useZodForm(ticketSchema, {
    defaultValues: { category: "", subject: "", message: "" },
  });

  useEffect(() => {
    const oid =
      new URLSearchParams(window.location.search).get("orderId") || undefined;
    if (!oid) return;
    setOrderId(oid);
    setShowForm(true);
    form.reset({
      category: "shipping",
      subject: `Sipariş sorunu (#${oid.slice(0, 8)})`,
      message: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ticketsQuery = useWebList<Ticket[]>({
    resource: RESOURCE,
    fetcher: async () => {
      const res = await supportApi.getMyTickets({ page: 1, pageSize: 10 });
      const data: any = res.data;
      return data?.tickets || data?.data || (Array.isArray(data) ? data : []);
    },
    enabled: !authLoading && isAuthenticated,
    query: { meta: { page: "support-tickets" } },
  });

  const create = useWebMutation(
    (values: TicketValues) =>
      supportApi.createTicket({
        subject: values.subject.trim(),
        category: values.category,
        message: values.message.trim(),
        ...(orderId ? { orderId } : {}),
      }),
    {
      invalidates: [RESOURCE],
      successMessage:
        "Destek talebiniz oluşturuldu. En kısa sürede dönüş yapacağız.",
      errorMessage: "Talep oluşturulamadı. Lütfen tekrar deneyin.",
      onSuccess: () => {
        form.reset({ category: "", subject: "", message: "" });
        setOrderId(undefined);
        setShowForm(false);
      },
    },
  );

  return {
    isAuthenticated,
    authLoading,
    tickets: ticketsQuery.data ?? [],
    ticketsLoading: ticketsQuery.isLoading,
    showForm,
    setShowForm,
    form,
    onSubmit: (values: TicketValues) => create.mutate(values),
    isSubmitting: create.isPending,
  };
}
