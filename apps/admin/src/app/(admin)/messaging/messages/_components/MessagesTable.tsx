"use client";

import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { usePrompt } from "@/provider/PromptProvider";
import { messageColumns } from "../_lib/columns";
import { messageRowMenu } from "../_lib/rowActions";
import { type Message } from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * The messages table — moderation row actions (approve / reject / revert / ban
 * sender) live here as mutations; rows come from the ResourceList context
 * (already mapped to `Message` by the page fetcher).
 */
export function MessagesTable() {
  const t = useTranslations();
  const router = useRouter();
  const prompt = usePrompt();

  const approve = useAdminMutation(
    (message: Message) => adminApi.approveMessage(message.id),
    {
      invalidates: ["messages"],
      successMessage: t("admin.messaging.messages.approved"),
    },
  );
  const reject = useAdminMutation(
    (message: Message) => adminApi.rejectMessage(message.id),
    {
      invalidates: ["messages"],
      successMessage: t("admin.messaging.messages.rejected"),
    },
  );
  const revert = useAdminMutation(
    (message: Message) => adminApi.revertMessage(message.id),
    {
      invalidates: ["messages"],
      successMessage: t("admin.messaging.messages.reverted"),
    },
  );
  const ban = useAdminMutation(
    (v: { messageId: string; userId: string; reason: string }) =>
      adminApi.banUser(v.userId, v.reason),
    {
      invalidates: ["messages"],
      successMessage: t("admin.messaging.messages.senderBanned"),
    },
  );

  const onBan = async (m: Message) => {
    if (!m.senderId) {
      toast.error(t("admin.messaging.messages.senderNotFound"));
      return;
    }
    const reason = await prompt({
      title: t("admin.messaging.messages.banSenderTitle"),
      label: t("admin.messaging.messages.banReason"),
      defaultValue: t("admin.messaging.messages.defaultBanReason"),
      confirmLabel: t("admin.messaging.messages.ban"),
      destructive: true,
      required: false,
    });
    if (reason === null) return;
    ban.mutate({
      messageId: m.id,
      userId: m.senderId,
      reason: reason.trim() || t("admin.messaging.messages.defaultBanReason"),
    });
  };

  const columns = messageColumns(
    messageRowMenu(
      {
        onView: (m) => router.push(`/messaging/messages/${m.id}`),
        onApprove: (m) => approve.mutate(m),
        onReject: (m) => reject.mutate(m),
        onRevert: (m) => revert.mutate(m),
        onBan,
        busyId: approve.isPending
          ? approve.variables?.id
          : reject.isPending
            ? reject.variables?.id
            : revert.isPending
              ? revert.variables?.id
              : ban.isPending
                ? ban.variables?.messageId
                : undefined,
      },
      t,
    ),
    t,
  );

  return (
    <ResourceList.Table
      columns={columns}
      emptyText={t("admin.messaging.messages.notFound")}
    />
  );
}
