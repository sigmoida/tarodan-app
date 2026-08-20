"use client";

import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { Form, FormTextarea } from "@tarodan/ui/form";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import SectionCard from "@/components/ui/SectionCard";
import { formatDate, formatDateTime } from "@/lib/format";
import { ticketStatusStyles, categoryLabel } from "../../_lib/data";
import { useTicketDetail } from "../_hooks/useTicketDetail";
import { useTranslations } from "next-intl";

export default function TicketDetailClient() {
  const t = useTranslations();
  const { ticket, loading, form, onSubmit, isSending } = useTicketDetail();

  if (loading) {
    return (
      <PageShell className="flex items-center justify-center">
        <Spinner size="lg" />
      </PageShell>
    );
  }
  if (!ticket) return null;

  const status =
    ticketStatusStyles(t)[ticket.status] || ticketStatusStyles(t).open;
  const isClosed = ticket.status === "closed";
  const replyValue = form.watch("reply") ?? "";

  return (
    <PageShell className="pb-16">
      <PageHeader
        backHref="/support"
        backLabel={t("page.support.ticketdetailclient.destekMerkezi")}
        title={ticket.subject}
        description={`${ticket.ticketNumber ? `#${ticket.ticketNumber} · ` : ""}${categoryLabel(ticket.category, t)} · ${formatDate(ticket.createdAt)}`}
        actions={
          <span
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
        }
      />

      <SectionCard title={t("page.support.ticketdetailclient.mesajlar")}>
        <div className="space-y-4">
          {ticket.messages
            ?.filter((m) => !m.isInternal)
            .map((message) => {
              const mine = message.senderId === ticket.creatorId;
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      mine
                        ? "rounded-br-sm bg-primary-500 text-inverted"
                        : "rounded-bl-sm border border-border bg-surface text-body"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span
                        className={`text-xs font-medium ${mine ? "text-inverted/90" : "text-heading"}`}
                      >
                        {mine
                          ? t("page.support.ticketdetailclient.siz")
                          : message.senderName ||
                            t("page.support.ticketdetailclient.destekEkibi")}
                      </span>
                      <span
                        className={`text-2xs ${mine ? "text-inverted/70" : "text-muted"}`}
                      >
                        {formatDateTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {message.content}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      </SectionCard>

      {isClosed ? (
        <SectionCard className="text-center text-muted">
          {t(
            "page.support.ticketdetailclient.buTalepKapatilmistirYeniBirSorun",
          )}
        </SectionCard>
      ) : (
        <SectionCard>
          <Form form={form} onSubmit={onSubmit} className="space-y-4">
            <FormTextarea
              name="reply"
              label={t("support.yourReply")}
              rows={4}
              placeholder={t("support.replyPlaceholder")}
              maxLength={2000}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                isLoading={isSending}
                disabled={isSending || !replyValue.trim()}
                leftIcon={<PaperAirplaneIcon className="h-5 w-5" />}
              >
                {t("page.support.ticketdetailclient.gonder")}
              </Button>
            </div>
          </Form>
        </SectionCard>
      )}
    </PageShell>
  );
}
