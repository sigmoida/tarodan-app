"use client";

import { useState } from "react";
import { Modal, ModalFooter, Checkbox, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useTranslations } from "next-intl";

/** Reply to a ticket (optionally as an internal note). Owns its own mutation. */
export function TicketReplyModal({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const reply = useAdminMutation(
    () => adminApi.replyToTicket(ticketId, content, isInternal),
    {
      invalidates: ["tickets"],
      successMessage: t("admin.messaging.support.replySent"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.messaging.support.reply")}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <Textarea
          label={t("common.message")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder={t("admin.messaging.support.replyPlaceholder")}
        />
        <Checkbox
          checked={isInternal}
          onChange={(e) => setIsInternal(e.target.checked)}
          label={t("admin.messaging.support.internalNoteHelper")}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => reply.mutate()}
          confirmLabel={t("common.send")}
          isLoading={reply.isPending}
          disabled={!content.trim()}
        />
      </div>
    </Modal>
  );
}
