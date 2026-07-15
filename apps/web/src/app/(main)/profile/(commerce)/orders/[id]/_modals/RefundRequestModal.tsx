"use client";

import {
  Button,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { useMutation } from "@tanstack/react-query";
import { mediaApi, refundsApi, type RefundReason } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
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
        err?.response?.data?.message ||
          (locale === "en"
            ? "Failed to create refund request"
            : "İade talebi oluşturulamadı"),
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

  // 14 gün koşulsuz iade: cayma penceresinde (preparing / in_cooling_off) sebep,
  // açıklama ve foto opsiyoneldir — backend bu pencerede koşulsuz iade işler.
  // Sadece 14 gün sonrası (dispute) açıklama + foto zorunludur.
  const isDispute = phase === "past_cooling_off";
  const descriptionRequired = isDispute;
  const evidenceRequired = isDispute;
  // Hasar/yanlış ürün gibi sebeplerde foto yükleme alanını pencere içinde de
  // (opsiyonel) göster; zorunluluk yalnızca dispute'ta geçerli.
  const showEvidenceUpload =
    evidenceRequired ||
    ["damaged", "wrong_item", "not_as_described", "missing_parts"].includes(
      reason,
    );

  const reasonOptions: { value: RefundReason; label: string }[] = [
    {
      value: "changed_mind",
      label: t("order.refundReasonChangedMind"),
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
      value: "other",
      label: t("trade.dispute.reasonOther"),
    },
  ];

  const handleSubmit = async () => {
    if (descriptionRequired && description.trim().length < 20) {
      toast.error(
        locale === "en"
          ? "Description must be at least 20 characters"
          : "Açıklama en az 20 karakter olmalıdır",
      );
      return;
    }
    if (evidenceRequired && evidenceFiles.length === 0) {
      toast.error(
        locale === "en"
          ? "Photo evidence is required for this reason"
          : "Bu sebep için en az bir kanıt fotoğrafı gereklidir",
      );
      return;
    }

    submitMutation.mutate();
  };

  const phaseDescription =
    phase === "preparing"
      ? locale === "en"
        ? "The seller has not shipped yet. Your refund will be processed instantly."
        : "Satıcı henüz kargoya vermedi. İadeniz anında işlenecek."
      : phase === "in_cooling_off"
        ? locale === "en"
          ? "You're within the 14-day right-of-withdrawal window. Your request will be approved automatically and a return shipping label will be created — drop the package off at any Sürat branch."
          : "14 günlük cayma hakkı süresindesiniz. Talebiniz otomatik onaylanır; size bir iade kargo numarası verilecek, paketi en yakın Sürat şubesine bırakmanız yeterli."
        : locale === "en"
          ? "The cooling-off period has expired. Your request will be reviewed by the seller and admin team."
          : "14 günlük cayma süresi dolmuş. Talebiniz satıcı ve admin tarafından incelenecek.";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("order.requestRefundTitle")}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="bg-surface rounded-lg p-3 text-sm">
          <p className="text-muted">
            {t("order.order")}:{" "}
            <span className="font-medium text-heading">{orderNumber}</span>
          </p>
        </div>

        <div className="bg-info-50 border border-info-200 rounded-lg p-3 text-sm text-info-800">
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
              {locale === "en"
                ? `This order has ${quantity} items. Choose how many to return.`
                : `Bu siparişte ${quantity} adet var. Kaç adedini iade edeceğinizi seçin.`}
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
                ? locale === "en"
                  ? "Please describe the issue in detail (min 20 chars)"
                  : "Sorunu detaylı açıklayın (en az 20 karakter)"
                : locale === "en"
                  ? "Optional"
                  : "Opsiyonel"
            }
          />
        </div>

        {showEvidenceUpload && (
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              {locale === "en"
                ? "Evidence photos (max 5)"
                : "Kanıt fotoğrafları (maks 5)"}{" "}
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
                  <button
                    type="button"
                    onClick={() => removeEvidence(idx)}
                    className="absolute top-0 right-0 bg-danger-500 text-inverted rounded-bl-lg w-5 h-5 flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
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
              {locale === "en"
                ? "Tap + to upload photos of the issue."
                : "Sorunun fotoğraflarını yüklemek için + simgesine dokunun."}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={submitMutation.isPending}
          >
            {t("trade.dispute.cancelCta")}
          </Button>
          <Button
            variant="primary"
            className="flex-1 flex items-center justify-center gap-2"
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <Spinner
                size="sm"
                color="border-surface-elevated border-t-transparent"
              />
            ) : null}
            {t("order.submitRefund")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
