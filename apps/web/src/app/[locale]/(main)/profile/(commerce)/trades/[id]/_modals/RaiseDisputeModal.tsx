/** @format */

"use client";

import { useEffect, useState } from "react";
import { Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { tradesApi } from "@/lib/api";
import type { MessageKey } from "@tarodan/i18n";

/** Backend TradeDispute reason enum'u — birebir aynı değerler. */
const DISPUTE_REASONS = [
  "not_as_described",
  "damaged",
  "wrong_item",
  "not_received",
] as const;
type DisputeReason = (typeof DISPUTE_REASONS)[number];

const DISPUTE_REASON_LABEL_KEY: Record<DisputeReason, MessageKey> = {
  not_as_described: "trade.dispute.reasonNotAsDescribed",
  damaged: "trade.dispute.reasonShipmentDamaged",
  wrong_item: "trade.dispute.reasonWrongItem",
  not_received: "trade.dispute.reasonShipmentLost",
};

const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 1000;

interface RaiseDisputeModalProps {
  open: boolean;
  onClose: () => void;
  tradeId: string;
  /** Başarıda takas sorgusunu tazeler (durum disputed'a döner). */
  onSuccess: () => Promise<unknown>;
}

/**
 * Takas itirazı: ürünler depodan çıktıktan sonraki pencerede (both_shipped /
 * *_received / shipping_to_recipients) taraflardan biri sorun bildirir. Takas
 * başına tek itiraz — payload itiraz varlığını göstermediğinden ikinci deneme
 * API hatasıyla toast'a düşer.
 */
export default function RaiseDisputeModal({
  open,
  onClose,
  tradeId,
  onSuccess,
}: RaiseDisputeModalProps) {
  const t = useTranslations();
  const [reason, setReason] = useState<DisputeReason>("not_as_described");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("not_as_described");
    setDescription("");
  }, [open]);

  const submitMutation = useMutation({
    mutationFn: () =>
      tradesApi.raiseDispute(tradeId, {
        reason,
        description: description.trim(),
      }),
    onSuccess: async () => {
      toast.success(t("trade.dispute.successMessage"));
      onClose();
      await onSuccess();
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.message || t("trade.dispute.errorMessage"),
      ),
  });

  const handleSubmit = () => {
    if (description.trim().length < DESCRIPTION_MIN) {
      toast.error(t("trade.dispute.minLengthError"));
      return;
    }
    submitMutation.mutate();
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("trade.dispute.modalTitle")}
      description={t("trade.dispute.modalIntro")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={submitMutation.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSubmit}
          cancelLabel={t("trade.dispute.cancelCta")}
          confirmLabel={t("trade.dispute.submitCta")}
          destructive
          isLoading={submitMutation.isPending}
        />
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {t("common.reason")}
          </label>
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as DisputeReason)}
          >
            {DISPUTE_REASONS.map((value) => (
              <option key={value} value={value}>
                {t(DISPUTE_REASON_LABEL_KEY[value])}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {t("trade.dispute.descriptionLabel")}
            <span className="text-danger-500 ml-1">*</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, DESCRIPTION_MAX))
            }
            placeholder={t("trade.dispute.descriptionPlaceholder")}
            rows={4}
            maxLength={DESCRIPTION_MAX}
          />
          <p className="mt-1 text-right text-xs text-subtle">
            {description.length}/{DESCRIPTION_MAX}
          </p>
        </div>
      </div>
    </Modal>
  );
}
