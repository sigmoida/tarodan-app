import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Message {
  id: string;
  content: string;
  originalContent: string;
  senderId: string;
  receiverId: string;
  sender: { displayName: string; email: string };
  receiver: { displayName: string; email: string };
  status: "pending" | "approved" | "rejected";
  flaggedReason: string;
  createdAt: string;
  threadId: string;
}

/** List filter options (frontend values; mapped to API status in the fetcher). */
export const messageFilterOptions = (t: T) => [
  { value: "all", label: t("common.all") },
  { value: "pending", label: t("admin.messaging.messages.filters.pending") },
  { value: "approved", label: t("admin.messaging.messages.filters.approved") },
  { value: "rejected", label: t("admin.messaging.messages.filters.rejected") },
];

export const messageStatusConfig = (t: T): Record<string, StatusConfig> => ({
  sent: {
    label: t("admin.messaging.messages.status.sent"),
    variant: "default",
  },
  pending: {
    label: t("admin.messaging.messages.status.pending"),
    variant: "warning",
  },
  pending_approval: {
    label: t("admin.messaging.messages.status.pending"),
    variant: "warning",
  },
  approved: { label: t("common.approved"), variant: "success" },
  rejected: { label: t("common.rejected"), variant: "danger" },
});

/** Frontend filter value → API status ("pending" is stored as "pending_approval"). */
export function mapFilterToApiStatus(
  f: string | undefined,
): string | undefined {
  if (!f || f === "all") return undefined;
  if (f === "pending") return "pending_approval";
  return f;
}

/** Normalize the varied message payload into the Message shape. */
export function mapMessage(m: any, t: T): Message {
  return {
    id: m.id,
    content: m.content || m.originalContent || "",
    originalContent: m.originalContent || m.content || "",
    senderId: m.senderId || m.sender?.id || "",
    receiverId: m.receiverId || m.receiver?.id || "",
    sender: {
      displayName:
        m.sender?.displayName || m.senderName || t("admin.messaging.unknown"),
      email: m.sender?.email || "",
    },
    receiver: {
      displayName:
        m.receiver?.displayName ||
        m.receiverName ||
        t("admin.messaging.unknown"),
      email: m.receiver?.email || "",
    },
    status: (m.status === "pending_approval"
      ? "pending"
      : m.status) as Message["status"],
    flaggedReason: m.flaggedReason || "",
    createdAt: m.createdAt,
    threadId: m.threadId || m.thread?.id || "",
  };
}
