"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

export function AddTrackingModal({
  open,
  onClose,
  orderId,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
}) {
  const t = useTranslations();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [notes, setNotes] = useState("");

  const submit = useAdminMutation(
    () =>
      adminApi.addOrderTracking(orderId, {
        trackingNumber: trackingNumber.trim(),
        carrier: "surat",
        notes: notes.trim(),
      }),
    {
      invalidates: ["orders"],
      successMessage: t("admin.operations.orders.trackingAdded"),
      errorMessage: t("admin.operations.orders.statusUpdateFailed"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("admin.operations.orders.addTracking")}
    >
      <div className="space-y-4">
        <Select
          label={t("admin.operations.orders.carrier")}
          value="surat"
          disabled
        >
          <option value="surat">
            {t("admin.operations.orders.carrierSurat")}
          </option>
        </Select>
        <Input
          label={t("admin.operations.common.trackingNumber")}
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          maxLength={100}
          disabled={submit.isPending}
        />
        <Textarea
          label={t("admin.operations.orders.statusChangeReason")}
          placeholder={t("admin.operations.orders.trackingReasonPlaceholder")}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          rows={3}
          disabled={submit.isPending}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => submit.mutate()}
          confirmLabel={t("admin.operations.orders.markShipped")}
          disabled={!trackingNumber.trim() || !notes.trim()}
          isLoading={submit.isPending}
        />
      </div>
    </Modal>
  );
}
