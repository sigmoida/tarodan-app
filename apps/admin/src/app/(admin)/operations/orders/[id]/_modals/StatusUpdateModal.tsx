"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Select } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { isPostShipping } from "../_lib/status";

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
  const [newStatus, setNewStatus] = useState(currentStatus);
  useEffect(() => {
    if (open) setNewStatus(currentStatus);
  }, [open, currentStatus]);

  const postShipping = isPostShipping(currentStatus);

  const update = useAdminMutation(
    (status: string) => adminApi.updateOrderStatus(orderId, status),
    {
      invalidates: ["orders"],
      successMessage: t("admin.operations.orders.statusUpdated"),
      errorMessage: t("admin.operations.orders.statusUpdateFailed"),
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (newStatus === "cancelled" && postShipping) {
      toast.error(t("admin.operations.orders.postShippingCancelBlocked"));
      return;
    }
    update.mutate(newStatus);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("admin.operations.orders.updateStatus")}
    >
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-body">
          {t("admin.operations.orders.newStatus")}
        </label>
        <Select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
        >
          <option value="pending_payment">
            {t("admin.operations.orders.status.pendingPayment")}
          </option>
          <option value="paid">
            {t("admin.operations.orders.status.paid")}
          </option>
          <option value="preparing">
            {t("admin.operations.orders.status.preparing")}
          </option>
          <option value="shipped">
            {t("admin.operations.orders.status.shipped")}
          </option>
          <option value="delivered">
            {t("admin.operations.orders.status.delivered")}
          </option>
          <option value="completed">
            {t("admin.operations.orders.status.completed")}
          </option>
          <option value="cancelled" disabled={postShipping}>
            {t("admin.operations.orders.status.cancelled")}
            {postShipping
              ? t("admin.operations.orders.cancelClosedSuffix")
              : ""}
          </option>
          <option value="refunded">
            {t("admin.operations.orders.status.refunded")}
          </option>
        </Select>
        {postShipping && (
          <p className="mt-2 text-xs text-muted">
            {t("admin.operations.orders.postShippingCancelNote")}
          </p>
        )}
      </div>
      <ModalFooter
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={t("common.update")}
        isLoading={update.isPending}
      />
    </Modal>
  );
}
