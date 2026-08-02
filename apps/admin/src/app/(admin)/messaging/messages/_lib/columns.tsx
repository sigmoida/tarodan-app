import { Badge } from "@tarodan/ui";
import { col, TruncatedText, type RowActionItem } from "@/components/table";
import { type Message, messageStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function messageColumns(rowMenu: (m: Message) => RowActionItem[], t: T) {
  return [
    col.user<Message>(
      t("admin.messaging.messages.sender"),
      (m) => ({
        name: m.sender.displayName,
        secondary: m.sender.email,
        href: m.senderId ? `/accounts/users/${m.senderId}` : undefined,
      }),
      { minWidth: 260, sortKey: "sender.displayName" },
    ),
    col.user<Message>(
      t("admin.messaging.messages.receiver"),
      (m) => ({
        name: m.receiver.displayName,
        secondary: m.receiver.email,
        href: m.receiverId ? `/accounts/users/${m.receiverId}` : undefined,
      }),
      { minWidth: 260, sortKey: "receiver.displayName" },
    ),
    col.text<Message>(
      t("common.message"),
      (m) => m.originalContent || m.content,
      {
        grow: 3,
        minWidth: 220,
        sortKey: "content",
        sortType: "text",
      },
    ),
    col.badge<Message>(
      t("admin.messaging.messages.warning"),
      (m) =>
        m.flaggedReason ? (
          <Badge variant="warning" className="min-w-0 max-w-full">
            <TruncatedText className="min-w-0">{m.flaggedReason}</TruncatedText>
          </Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
      { minWidth: 220, sortKey: "flaggedReason", sortType: "text" },
    ),
    col.badge<Message>(
      t("common.status"),
      (m) => <Badge status={m.status} config={messageStatusConfig(t)} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.date<Message>(t("common.date"), "createdAt"),
    col.rowMenu<Message>(rowMenu),
  ];
}
