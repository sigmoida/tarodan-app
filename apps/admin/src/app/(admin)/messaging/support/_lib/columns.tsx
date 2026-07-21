import { Badge, enumLabel } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import {
  supportTicketStatusConfig,
  supportTicketPriorityConfig,
  supportTicketCategoryConfig,
  type SupportTicket,
  type GuestContact,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Support ticket list columns — the ticket number links to the detail page. */
export const ticketColumns = (t: T) => [
  col.link<SupportTicket>(
    t("admin.messaging.support.ticketNumber"),
    (t) => ({ href: `/messaging/support/${t.id}`, label: t.ticketNumber }),
    { sortKey: "ticketNumber", sortType: "text" },
  ),
  col.text<SupportTicket>(t("admin.messaging.support.subject"), "subject", {
    grow: 3,
    minWidth: 200,
  }),
  col.user<SupportTicket>(
    t("admin.messaging.support.creator"),
    (t) => ({ name: t.creatorName || "—" }),
    { sortKey: "creatorName" },
  ),
  col.muted<SupportTicket>(
    t("common.category"),
    (ticket) =>
      enumLabel(
        supportTicketCategoryConfig(t),
        ticket.category,
        ticket.category,
      ),
    { sortKey: "category", sortType: "text" },
  ),
  col.badge<SupportTicket>(
    t("admin.messaging.support.priorityLabel"),
    (ticket) => (
      <Badge status={ticket.priority} config={supportTicketPriorityConfig(t)} />
    ),
    { sortKey: "priority", sortType: "text" },
  ),
  col.badge<SupportTicket>(
    t("common.status"),
    (ticket) => (
      <Badge status={ticket.status} config={supportTicketStatusConfig(t)} />
    ),
    { sortKey: "status", sortType: "text" },
  ),
  col.date<SupportTicket>(t("admin.messaging.support.createdAt"), "createdAt"),
];

/** Guest contact list columns — the row menu opens the detail modal. */
export function guestColumns(
  rowMenu: (g: GuestContact) => RowActionItem[],
  t: T,
) {
  return [
    col.code<GuestContact>(
      t("admin.messaging.support.reference"),
      "referenceNumber",
    ),
    col.user<GuestContact>(
      t("admin.messaging.support.fullName"),
      (g) => ({ name: g.name, secondary: g.email }),
      { sortKey: "name", sortType: "text" },
    ),
    col.text<GuestContact>(t("admin.messaging.support.subject"), "subject", {
      grow: 3,
      minWidth: 200,
    }),
    col.date<GuestContact>(t("common.date"), "createdAt"),
    col.rowMenu<GuestContact>(rowMenu),
  ];
}
