"use client";

import { Button, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { refundsApi, type RefundReason } from "@/lib/api";
import { useTranslation } from "@/i18n/LanguageContext";
import { useState } from "react";
import toast from "react-hot-toast";

type Phase = "preparing" | "in_cooling_off" | "past_cooling_off";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  phase: Phase;
  onSuccess: () => void;
}

const REASONS_REQUIRING_EVIDENCE: RefundReason[] = [
  "damaged",
  "wrong_item",
  "not_as_described",
  "missing_parts",
];

export default function RefundRequestModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  phase,
  onSuccess,
}: Props) {
  const { locale } = useTranslation();
  const [reason, setReason] = useState<RefundReason>("changed_mind");
  const [description, setDescription] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const evidencePhotoUrls = evidenceInput
    .split(/\s+|,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const evidenceRequired = REASONS_REQUIRING_EVIDENCE.includes(reason);
  const descriptionRequired = phase === "past_cooling_off";

  const reasonOptions: { value: RefundReason; label: string }[] = [
    {
      value: "changed_mind",
      label: locale === "en" ? "Changed my mind" : "Vazgeçtim (cayma hakkı)",
    },
    {
      value: "damaged",
      label: locale === "en" ? "Damaged" : "Hasarlı geldi",
    },
    {
      value: "wrong_item",
      label: locale === "en" ? "Wrong item" : "Yanlış ürün geldi",
    },
    {
      value: "not_as_described",
      label:
        locale === "en"
          ? "Not as described"
          : "Açıklamayla uyuşmuyor",
    },
    {
      value: "missing_parts",
      label: locale === "en" ? "Missing parts" : "Eksik parça",
    },
    {
      value: "other",
      label: locale === "en" ? "Other" : "Diğer",
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
    if (evidenceRequired && evidencePhotoUrls.length === 0) {
      toast.error(
        locale === "en"
          ? "Photo evidence is required for this reason"
          : "Bu sebep için en az bir kanıt fotoğrafı (URL) gereklidir",
      );
      return;
    }

    setSubmitting(true);
    try {
      await refundsApi.create(orderId, {
        reason,
        description: description.trim() || undefined,
        evidencePhotoUrls:
          evidencePhotoUrls.length > 0 ? evidencePhotoUrls : undefined,
      });
      toast.success(
        locale === "en"
          ? "Refund request created"
          : "İade talebi oluşturuldu",
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          (locale === "en"
            ? "Failed to create refund request"
            : "İade talebi oluşturulamadı"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const phaseDescription =
    phase === "preparing"
      ? locale === "en"
        ? "The seller has not shipped yet. Your refund will be processed instantly."
        : "Satıcı henüz kargoya vermedi. İadeniz anında işlenecek."
      : phase === "in_cooling_off"
        ? locale === "en"
          ? "You're within the 14-day cooling-off period. Once approved, a return shipping label will be issued."
          : "14 günlük cayma hakkı süresindesiniz. Onaylandıktan sonra iade kargosu açılacak."
        : locale === "en"
          ? "The cooling-off period has expired. Your request will be reviewed by the seller and admin team."
          : "14 günlük cayma süresi dolmuş. Talebiniz satıcı ve admin tarafından incelenecek.";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={locale === "en" ? "Request Refund" : "İade Talebi Oluştur"}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="bg-surface rounded-lg p-3 text-sm">
          <p className="text-muted">
            {locale === "en" ? "Order" : "Sipariş"}:{" "}
            <span className="font-medium text-heading">{orderNumber}</span>
          </p>
        </div>

        <div className="bg-info-50 border border-info-200 rounded-lg p-3 text-sm text-info-800">
          {phaseDescription}
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {locale === "en" ? "Reason" : "Sebep"}
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

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {locale === "en" ? "Description" : "Açıklama"}
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

        {evidenceRequired && (
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              {locale === "en"
                ? "Evidence photo URLs"
                : "Kanıt fotoğraf URL'leri"}{" "}
              <span className="text-danger-500">*</span>
            </label>
            <Textarea
              value={evidenceInput}
              onChange={(e) => setEvidenceInput(e.target.value)}
              rows={3}
              placeholder={
                locale === "en"
                  ? "Paste URLs separated by space or comma"
                  : "URL'leri boşluk veya virgülle ayırın"
              }
            />
            <p className="text-xs text-muted mt-1">
              {locale === "en"
                ? "Upload photos to a service (e.g. Imgur) and paste links here"
                : "Fotoğrafları bir servise (örn. Imgur) yükleyip linklerini buraya yapıştırın"}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={submitting}
          >
            {locale === "en" ? "Cancel" : "Vazgeç"}
          </Button>
          <Button
            variant="primary"
            className="flex-1 flex items-center justify-center gap-2"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <Spinner size="sm" color="border-surface-elevated border-t-transparent" />
            ) : null}
            {locale === "en" ? "Submit" : "Talep Oluştur"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
