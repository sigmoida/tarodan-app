"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  ChatBubbleLeftRightIcon,
  ArrowUturnLeftIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { Button, StatusBadge, enumLabel } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { SectionCard } from "@/components/detail/SectionCard";
import { PartyCard } from "@/components/detail/PartyCard";
import { Timeline } from "@/components/detail/Timeline";
import { DataList, Field } from "@/components/detail/DataList";
import { TicketReplyModal } from "./_modals/TicketReplyModal";
import { TicketStatusModal } from "./_modals/TicketStatusModal";
import {
  supportTicketStatusConfig,
  supportTicketPriorityConfig,
  supportTicketCategoryConfig,
} from "../_lib/types";
import { useTranslations } from "next-intl";

interface SupportTicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  creator: { id: string; displayName: string; email: string };
  assignee?: { id: string; displayName: string };
  messages: Array<{
    id: string;
    sender: { id: string; displayName: string };
    content: string;
    isInternal: boolean;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export default function SupportTicketDetailPage() {
  const translate = useTranslations();
  const { id } = useParams<{ id: string }>();
  const [replyOpen, setReplyOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <DetailPage<SupportTicketDetail>
      resource="tickets"
      id={id}
      fetcher={(tid) => adminApi.getTicket(tid).then((r) => r.data)}
      backHref="/messaging/support"
      emptyTitle={translate("admin.messaging.support.notFound")}
      title={(ticket) => ticket.subject}
      subtitle={(ticket) => `#${ticket.ticketNumber}`}
      badge={(ticket) => (
        <span className="flex items-center gap-2">
          <StatusBadge
            status={ticket.priority}
            config={supportTicketPriorityConfig(translate)}
          />
          <StatusBadge
            status={ticket.status}
            config={supportTicketStatusConfig(translate)}
          />
        </span>
      )}
      actions={() => (
        <>
          <Button
            variant="primary"
            leftIcon={<ArrowUturnLeftIcon className="h-5 w-5" />}
            onClick={() => setReplyOpen(true)}
          >
            {translate("admin.messaging.support.reply")}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<PencilSquareIcon className="h-5 w-5" />}
            onClick={() => setStatusOpen(true)}
          >
            {translate("admin.messaging.support.updateStatus")}
          </Button>
        </>
      )}
    >
      {(ticket) => (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <SectionCard
                title={translate("admin.messaging.support.messages")}
                icon={ChatBubbleLeftRightIcon}
              >
                <div className="space-y-4">
                  {ticket.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg p-4 ${
                        message.isInternal
                          ? "border border-warning-200 bg-warning-50"
                          : "bg-surface-alt"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-heading">
                            {message.sender.displayName}
                          </span>
                          {message.isInternal && (
                            <span className="rounded bg-warning-200 px-2 py-0.5 text-xs text-warning-800">
                              {translate(
                                "admin.messaging.support.internalNote",
                              )}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          {new Date(message.createdAt).toLocaleString(
                            translate("common.dateLocale"),
                          )}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-body">
                        {message.content}
                      </p>
                    </div>
                  ))}
                  {ticket.messages.length === 0 && (
                    <p className="text-sm text-muted">
                      {translate("admin.messaging.support.noMessages")}
                    </p>
                  )}
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard
                title={translate("admin.messaging.support.ticketInfo")}
              >
                <DataList columns={1}>
                  <Field label={translate("common.category")}>
                    {enumLabel(
                      supportTicketCategoryConfig(translate),
                      ticket.category,
                      ticket.category,
                    )}
                  </Field>
                  <Field
                    label={translate("admin.messaging.support.priorityLabel")}
                  >
                    <StatusBadge
                      status={ticket.priority}
                      config={supportTicketPriorityConfig(translate)}
                    />
                  </Field>
                  <Field label={translate("common.status")}>
                    <StatusBadge
                      status={ticket.status}
                      config={supportTicketStatusConfig(translate)}
                    />
                  </Field>
                  {ticket.assignee && (
                    <Field
                      label={translate("admin.messaging.support.assignee")}
                    >
                      {ticket.assignee.displayName}
                    </Field>
                  )}
                </DataList>
              </SectionCard>

              <PartyCard
                title={translate("admin.messaging.support.creator")}
                name={ticket.creator.displayName}
                userHref={`/accounts/users/${ticket.creator.id}`}
                email={ticket.creator.email}
              />

              <Timeline
                items={[
                  {
                    label: translate("admin.messaging.support.createdAt"),
                    at: ticket.createdAt,
                  },
                  {
                    label: translate("admin.messaging.support.lastUpdated"),
                    at: ticket.updatedAt,
                  },
                  {
                    label: translate("admin.messaging.support.resolvedAt"),
                    at: ticket.resolvedAt,
                  },
                ]}
              />
            </div>
          </div>

          {replyOpen && (
            <TicketReplyModal
              ticketId={ticket.id}
              onClose={() => setReplyOpen(false)}
            />
          )}
          {statusOpen && (
            <TicketStatusModal
              ticketId={ticket.id}
              currentStatus={ticket.status}
              onClose={() => setStatusOpen(false)}
            />
          )}
        </>
      )}
    </DetailPage>
  );
}
