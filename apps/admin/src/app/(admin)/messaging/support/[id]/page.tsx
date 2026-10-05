"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowUturnLeftIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, EmptyState, enumLabel } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { DetailPage } from "@/components/detail/DetailPage";
import { SectionCard } from "@/components/detail/SectionCard";
import { PartyCard } from "@/components/detail/PartyCard";
import { Timeline } from "@/components/detail/Timeline";
import { DataList, Field } from "@/components/detail/DataList";
import { DetailLayout } from "@/components/detail/DetailLayout";
import { Panel } from "@/components/detail/Panel";
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
  creatorId: string;
  creatorName: string;
  assigneeId?: string;
  assigneeName?: string;
  messages: Array<{
    id: string;
    senderId: string;
    senderName: string;
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
          <Badge
            status={ticket.priority}
            config={supportTicketPriorityConfig(translate)}
          />
          <Badge
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
          <DetailLayout
            main={
              <SectionCard
                title={translate("admin.messaging.support.messages")}
              >
                <div className="space-y-4">
                  {ticket.messages.map((message) => (
                    <Panel
                      key={message.id}
                      tone={message.isInternal ? "default" : "muted"}
                      className={
                        message.isInternal
                          ? "border-warning-200 bg-warning-50"
                          : undefined
                      }
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-heading">
                            {message.senderName}
                          </span>
                          {message.isInternal && (
                            <Badge variant="warning" size="sm">
                              {translate(
                                "admin.messaging.support.internalNote",
                              )}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          {fmtDateTime(message.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-body">
                        {message.content}
                      </p>
                    </Panel>
                  ))}
                  {ticket.messages.length === 0 && (
                    <EmptyState
                      size="compact"
                      icon={false}
                      title={translate("admin.messaging.support.noMessages")}
                    />
                  )}
                </div>
              </SectionCard>
            }
            aside={
              <>
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
                      <Badge
                        status={ticket.priority}
                        config={supportTicketPriorityConfig(translate)}
                      />
                    </Field>
                    <Field label={translate("common.status")}>
                      <Badge
                        status={ticket.status}
                        config={supportTicketStatusConfig(translate)}
                      />
                    </Field>
                    {ticket.assigneeName && (
                      <Field
                        label={translate("admin.messaging.support.assignee")}
                      >
                        {ticket.assigneeName}
                      </Field>
                    )}
                  </DataList>
                </SectionCard>

                <PartyCard
                  title={translate("admin.messaging.support.creator")}
                  name={ticket.creatorName}
                  userHref={`/accounts/users/${ticket.creatorId}`}
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
              </>
            }
          />

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
