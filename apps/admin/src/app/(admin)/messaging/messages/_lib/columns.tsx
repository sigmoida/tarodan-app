import { Badge } from "@tarodan/ui";
import { col, type RowActionItem } from "@/components/table";
import { type Message, messageStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function messageColumns(rowMenu: (m: Message) => RowActionItem[], t: T) {
  return [
    col.id<Message>(
      t("admin.messaging.messages.conversationId"),
      (m) => m.threadId,
    ),
    col.user<Message>(
      t("admin.messaging.messages.sender"),
      (m) => ({
        name: m.sender.displayName,
        secondary: m.sender.email,
      }),
      { sortKey: "sender.displayName" },
    ),
    col.id<Message>(t("admin.messaging.messages.senderId"), (m) => m.senderId),
    col.user<Message>(
      t("admin.messaging.messages.receiver"),
      (m) => ({
        name: m.receiver.displayName,
        secondary: m.receiver.email,
      }),
      { sortKey: "receiver.displayName" },
    ),
    col.id<Message>(
      t("admin.messaging.messages.receiverId"),
      (m) => m.receiverId,
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
          <Badge variant="warning">{m.flaggedReason}</Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
      { sortKey: "flaggedReason", sortType: "text" },
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
