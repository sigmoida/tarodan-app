"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { getAdminManualStatusTargets } from "../_lib/status";

/**
 * Self-contained order status modal: owns the form + the update mutation
 * (toast + orders invalidation). Post-shipping cancel is blocked.
 */
export function StatusUpdateModal({
  open,
  onClose,
  orderId,
  currentStatus,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  currentStatus: string;
}) {
  const t = useTranslations();
  const targets = getAdminManualStatusTargets(currentStatus);
  const [newStatus, setNewStatus] = useState(targets[0] ?? currentStatus);
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setNewStatus(targets[0] ?? currentStatus);
      setNotes("");
    }
  }, [open, currentStatus, targets]);

  const update = useAdminMutation(
    () => adminApi.updateOrderStatus(orderId, newStatus, notes.trim()),
    {
      invalidates: ["orders"],
      successMessage: t("admin.operations.orders.statusUpdated"),
      errorMessage: t("admin.operations.orders.statusUpdateFailed"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("admin.operations.orders.updateStatus")}
    >
      <div className="space-y-4">
        <Select
          label={t("admin.operations.orders.newStatus")}
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          disabled={update.isPending}
        >
          {targets.map((status) => (
            <option key={status} value={status}>
              {status === "preparing"
                ? t("admin.operations.orders.status.preparing")
                : t("admin.operations.orders.status.delivered")}
            </option>
          ))}
        </Select>
        <Textarea
          label={t("admin.operations.orders.statusChangeReason")}
          placeholder={t(
            "admin.operations.orders.statusChangeReasonPlaceholder",
          )}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          rows={3}
          disabled={update.isPending}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => update.mutate()}
          confirmLabel={t("common.update")}
          disabled={targets.length === 0 || !notes.trim()}
          isLoading={update.isPending}
        />
      </div>
    </Modal>
  );
}
