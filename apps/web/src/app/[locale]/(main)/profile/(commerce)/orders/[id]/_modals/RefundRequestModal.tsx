"use client";

import { Input, Modal, Select, Textarea } from "@/components/ui";
import { IconButton, ModalFooter } from "@tarodan/ui";
import { useMutation } from "@tanstack/react-query";
import { mediaApi, refundsApi, type RefundReason } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";

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
  const [evidencePreviews, setEvidencePreviews] = useState<string[]>([]);
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

  const handleEvidenceAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files.slice(0, 5 - evidenceFiles.length);
    if (newFiles.length === 0) return;
    setEvidenceFiles((prev) => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) =>
        setEvidencePreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeEvidence = (index: number) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index));
    setEvidencePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Vazgeçme koşulsuz ilerler. Kusur/yanlış ürün iddiaları finansal tarafı
  // değiştirdiği için kanıt ve admin incelemesi gerektirir.
  const isDispute = phase === "past_cooling_off";
  const evidenceRequired = reason !== "changed_mind";
  const descriptionRequired = isDispute || evidenceRequired;
  const showEvidenceUpload = evidenceRequired;

  const reasonOptions: { value: RefundReason; label: string }[] = [
    {
      value: "changed_mind",
      label: t("order.refundReasonChangedMind"),
    },
    {
      value: "delivery_delayed",
      label: t("order.refundReasonDeliveryDelayed"),
    },
    {
      value: "damaged",
      label: t("order.refundReasonDamaged"),
    },
    {
      value: "wrong_item",
      label: t("order.refundReasonWrongItem"),
    },
    {
      value: "not_as_described",
      label: t("order.refundReasonNotAsDescribed"),
    },
    {
      value: "missing_parts",
      label: t("order.refundReasonMissingParts"),
    },
    {
      value: "counterfeit",
      label: t("order.refundReasonCounterfeit"),
    },
    {
      value: "defective",
      label: t("order.refundReasonDefective"),
    },
    {
      value: "buyer_damaged",
      label: t("order.refundReasonBuyerDamaged"),
    },
  ];

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
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              {t("order.evidencePhotosMax5")}{" "}
              {evidenceRequired ? (
                <span className="text-danger-500">*</span>
              ) : (
                <span className="text-muted font-normal">
                  ({t("common.optional")})
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {evidencePreviews.map((src, idx) => (
                <div
                  key={idx}
                  className="relative w-16 h-16 rounded-lg overflow-hidden border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <IconButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={t("common.delete")}
                    onClick={() => removeEvidence(idx)}
                    className="absolute right-0 top-0 h-5 w-5 rounded-bl-lg bg-danger-500 text-inverted"
                  >
                    ×
                  </IconButton>
                </div>
              ))}
              {evidenceFiles.length < 5 && (
                <label className="w-16 h-16 border-2 border-dashed flex items-center justify-center cursor-pointer hover:border-primary-400 rounded-lg">
                  <span className="text-2xl text-subtle">+</span>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleEvidenceAdd}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-muted mt-1">
              {t("order.tapToUploadPhotos")}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
