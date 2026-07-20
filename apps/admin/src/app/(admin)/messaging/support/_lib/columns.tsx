import {
  Badge,
  enumLabel,
  ticketStatusConfig,
  ticketPriorityConfig,
  ticketCategoryConfig,
} from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import type { SupportTicket, GuestContact } from "./types";

/** Support ticket list columns — the ticket number links to the detail page. */
export const ticketColumns = [
  col.link<SupportTicket>(
    "Talep No",
    (t) => ({ href: `/messaging/support/${t.id}`, label: t.ticketNumber }),
    { sortKey: "ticketNumber", sortType: "text" },
  ),
  col.text<SupportTicket>("Konu", "subject", { grow: 3, minWidth: 200 }),
  col.user<SupportTicket>(
    "Oluşturan",
    (t) => ({ name: t.creatorName || "—" }),
    { sortKey: "creatorName" },
  ),
  col.muted<SupportTicket>(
    "Kategori",
    (t) => enumLabel(ticketCategoryConfig, t.category, t.category),
    { sortKey: "category", sortType: "text" },
  ),
  col.badge<SupportTicket>(
    "Öncelik",
    (t) => <Badge status={t.priority} config={ticketPriorityConfig} />,
    { sortKey: "priority", sortType: "text" },
  ),
  col.badge<SupportTicket>(
    "Durum",
    (t) => <Badge status={t.status} config={ticketStatusConfig} />,
    { sortKey: "status", sortType: "text" },
  ),
  col.date<SupportTicket>("Oluşturma", "createdAt"),
];

/** Guest contact list columns — the row menu opens the detail modal. */
export function guestColumns(rowMenu: (g: GuestContact) => RowActionItem[]) {
  return [
    col.code<GuestContact>("Referans", "referenceNumber"),
    col.user<GuestContact>(
      "Ad Soyad",
      (g) => ({ name: g.name, secondary: g.email }),
      { sortKey: "name", sortType: "text" },
    ),
    col.text<GuestContact>("Konu", "subject", { grow: 3, minWidth: 200 }),
    col.date<GuestContact>("Tarih", "createdAt"),
    col.rowMenu<GuestContact>(rowMenu),
  ];
}
