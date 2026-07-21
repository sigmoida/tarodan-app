"use client";

import { useState } from "react";
import { Modal, ModalFooter, Select } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { ticketStatusChoices } from "../../_lib/types";
import { useTranslations } from "next-intl";

/** Change a ticket's status. Owns its own mutation. */
export function TicketStatusModal({
  ticketId,
  currentStatus,
  onClose,
}: {
  ticketId: string;
  currentStatus: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [status, setStatus] = useState(currentStatus);

  const update = useAdminMutation(
    () => adminApi.updateTicketStatus(ticketId, status),
    {
      invalidates: ["tickets"],
      successMessage: t("admin.messaging.support.statusUpdated"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.messaging.support.updateStatus")}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <Select
          label={t("admin.messaging.support.newStatus")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={ticketStatusChoices(t)}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => update.mutate()}
          confirmLabel={t("common.update")}
          isLoading={update.isPending}
        />
      </div>
    </Modal>
  );
}
