"use client";

import { Modal, Select, Textarea } from "@/components/ui";
import { ModalFooter } from "@tarodan/ui";
import { useMutation } from "@tanstack/react-query";
import { mediaApi, refundsApi, type RefundReason } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";
import EvidencePhotoPicker from "../_components/EvidencePhotoPicker";
import { buyerRefundReasonOptions } from "../_lib/refund-reasons";

type Phase = "preparing" | "in_cooling_off" | "past_cooling_off";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  phase: Phase;
  /** Siparişteki toplam adet. >1 ise adet bazlı kısmi iade seçici gösterilir. */
  quantity?: number;
  onSuccess: () => void;
}

export default function RefundRequestModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  phase,
  quantity = 1,
  onSuccess,
}: Props) {
  const t = useTranslations();
  const [reason, setReason] = useState<RefundReason>("changed_mind");
  const [description, setDescription] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [refundQuantity, setRefundQuantity] = useState(1);

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Fotoğrafları doğrudan yükle (URL yapıştırmaya gerek yok)
      let evidencePhotoUrls: string[] = [];
      if (evidenceFiles.length > 0) {
        const results = await Promise.all(
          evidenceFiles.map((file) => mediaApi.uploadReviewImage(file)),
        );
        evidencePhotoUrls = results
          .map((r) => r.data?.url)
          .filter(Boolean) as string[];
      }
      await refundsApi.create(orderId, {
        reason,
        description: description.trim() || undefined,
        evidencePhotoUrls:
          evidencePhotoUrls.length > 0 ? evidencePhotoUrls : undefined,
        // Adet bazlı kısmi iade: tüm adet iade ediliyorsa alanı gönderme.
        refundQuantity:
          quantity > 1 && refundQuantity < quantity
            ? refundQuantity
            : undefined,
      });
    },
    onSuccess: () => {
      toast.success(t("order.refundRequestCreated"));
      onSuccess();
      onClose();
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.message || t("order.refundRequestFailed"),
      ),
  });

  // Vazgeçme koşulsuz ilerler. Kusur/yanlış ürün iddiaları finansal tarafı
  // değiştirdiği için kanıt ve admin incelemesi gerektirir.
  const isDispute = phase === "past_cooling_off";
  const evidenceRequired = reason !== "changed_mind";
  const descriptionRequired = isDispute || evidenceRequired;
  const showEvidenceUpload = evidenceRequired;

  // Değerler paylaşılan listeden, etiketler web i18n'inden (tek kaynak).
  const reasonOptions = buyerRefundReasonOptions(t);

  const handleSubmit = async () => {
    if (descriptionRequired && description.trim().length < 20) {
      toast.error(t("order.descriptionMin20"));
      return;
    }
    if (evidenceRequired && evidenceFiles.length === 0) {
      toast.error(t("order.photoEvidenceRequired"));
      return;
    }

    submitMutation.mutate();
  };

  const phaseDescription =
    phase === "preparing"
      ? t("order.refundPhasePreparing")
      : phase === "in_cooling_off"
        ? t("order.refundPhaseCoolingOff")
        : t("order.refundPhasePastCoolingOff");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("order.requestRefundTitle")}
      size="lg"
      closeLabel={t("common.close")}
      dismissDisabled={submitMutation.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSubmit}
          cancelLabel={t("trade.dispute.cancelCta")}
          confirmLabel={t("order.submitRefund")}
          isLoading={submitMutation.isPending}
        />
      }
    >
      <div className="space-y-4">
        <div className="bg-surface rounded-lg p-3 text-sm">
          <p className="text-muted">
            {t("order.order")}:{" "}
            <span className="font-medium text-heading">{orderNumber}</span>
          </p>
        </div>

        <div className="bg-surface-alt border border-border rounded-lg p-3 text-sm text-muted">
          {phaseDescription}
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {t("common.reason")}
            {!isDispute && (
              <span className="text-muted font-normal ml-1">
                ({t("common.optional")})
              </span>
            )}
          </label>
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as RefundReason)}
            className="rounded-xl"
          >
            {reasonOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Adet bazlı kısmi iade: sipariş birden çok adetse kullanıcı kaç adedini
            iade edeceğini seçebilir (ör. "3 al 2 iade"). Tek adet siparişte gizli. */}
        {quantity > 1 && (
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              {t("order.quantityToRefund")}
            </label>
            <Select
              value={String(refundQuantity)}
              onChange={(e) => setRefundQuantity(Number(e.target.value))}
              className="rounded-xl"
            >
              {Array.from({ length: quantity }, (_, i) => i + 1).map((q) => (
                <option key={q} value={q}>
                  {q} / {quantity}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted mt-1">
              {t("order.refundQuantityHint", { quantity })}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {t("common.description")}
            {descriptionRequired && (
              <span className="text-danger-500 ml-1">*</span>
            )}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={
              descriptionRequired
                ? t("order.describeIssuePlaceholder")
                : t("common.optional")
            }
          />
        </div>

        {showEvidenceUpload && (
          <EvidencePhotoPicker
            files={evidenceFiles}
            onFilesChange={setEvidenceFiles}
            required={evidenceRequired}
          />
        )}
      </div>
    </Modal>
  );
}
