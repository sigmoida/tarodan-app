"use client";

import { useMemo } from "react";
import { z } from "zod";
import toast from "react-hot-toast";
import { Button, Modal, Radio } from "@tarodan/ui";
import { Form, FormTextarea, useZodForm } from "@tarodan/ui/form";
import { api } from "@/lib/api";

export type ReportEntityType = "product" | "user" | "collection" | "message";

export type ReportReason =
  | "spam"
  | "inappropriate_content"
  | "harassment"
  | "fake_product"
  | "scam"
  | "other";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: ReportEntityType;
  entityId: string;
  entityName?: string;
  locale?: string;
}

const REPORT_REASONS: {
  value: ReportReason;
  labelTr: string;
  labelEn: string;
}[] = [
  { value: "spam", labelTr: "Spam / İstenmeyen İçerik", labelEn: "Spam" },
  {
    value: "inappropriate_content",
    labelTr: "Uygunsuz İçerik",
    labelEn: "Inappropriate",
  },
  {
    value: "harassment",
    labelTr: "Taciz / Kötüye Kullanım",
    labelEn: "Harassment",
  },
  {
    value: "fake_product",
    labelTr: "Sahte / Yanıltıcı Ürün",
    labelEn: "Fake Product",
  },
  { value: "scam", labelTr: "Dolandırıcılık", labelEn: "Scam" },
  { value: "other", labelTr: "Diğer", labelEn: "Other" },
];

const REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [
  ReportReason,
  ...ReportReason[],
];

export default function ReportModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  locale = "tr",
}: ReportModalProps) {
  const en = locale === "en";

  const schema = useMemo(
    () =>
      z.object({
        reason: z.enum(REASON_VALUES, {
          errorMap: () => ({
            message: en ? "Please select a reason" : "Lütfen bir neden seçin",
          }),
        }),
        description: z.string().trim().max(500).optional().or(z.literal("")),
      }),
    [en],
  );
  type ReportValues = z.infer<typeof schema>;

  const form = useZodForm(schema, { defaultValues: { description: "" } });
  const reason = form.watch("reason");
  const description = form.watch("description") ?? "";

  const title = (() => {
    switch (entityType) {
      case "product":
        return en ? "Report Listing" : "İlanı Raporla";
      case "user":
        return en ? "Report User" : "Kullanıcıyı Raporla";
      case "collection":
        return en ? "Report Collection" : "Koleksiyonu Raporla";
      case "message":
        return en ? "Report Message" : "Mesajı Raporla";
      default:
        return en ? "Report" : "Raporla";
    }
  })();

  const onSubmit = async (v: ReportValues) => {
    const payload: {
      type: string;
      targetId: string;
      reason: string;
      description?: string;
    } = { type: entityType, targetId: entityId, reason: v.reason };
    // Backend only accepts a description of at least 10 characters.
    if (v.description && v.description.trim().length >= 10) {
      payload.description = v.description.trim();
    }

    try {
      await api.post("/user-reports", payload);
      toast.success(
        en
          ? "Report submitted. Our team will review it."
          : "Rapor gönderildi. Ekibimiz inceleyecektir.",
      );
      form.reset({ description: "" });
      onClose();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Report submission failed:", error);
      const errorMsg = error.response?.data?.message;
      const displayMsg = Array.isArray(errorMsg) ? errorMsg[0] : errorMsg;
      toast.error(
        displayMsg || (en ? "Failed to submit report" : "Rapor gönderilemedi"),
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-sm">
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        {entityName && (
          <div className="rounded-lg bg-surface p-2">
            <p className="text-xs text-muted">
              {en ? "Reporting:" : "Raporlanan:"}
            </p>
            <p className="truncate text-sm font-medium text-heading">
              {entityName}
            </p>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {en ? "Reason" : "Neden"} <span className="text-danger-500">*</span>
          </label>
          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex cursor-pointer items-center rounded-lg border p-2.5 text-sm transition-all ${
                  reason === r.value
                    ? "border-danger-500 bg-danger-50"
                    : "border-border"
                }`}
              >
                <Radio
                  name="reportReason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() =>
                    form.setValue("reason", r.value, { shouldValidate: true })
                  }
                />
                <span className="ml-2 text-body">
                  {en ? r.labelEn : r.labelTr}
                </span>
              </label>
            ))}
          </div>
          {form.formState.errors.reason && (
            <p className="mt-1 text-xs text-danger-600">
              {form.formState.errors.reason.message}
            </p>
          )}
        </div>

        <div>
          <FormTextarea
            name="description"
            label={
              en
                ? "Details (optional, min 10 chars)"
                : "Detaylar (isteğe bağlı, min 10 karakter)"
            }
            placeholder={en ? "More details..." : "Daha fazla detay..."}
            rows={2}
            maxLength={500}
          />
          <p className="mt-0.5 text-right text-xs text-subtle">
            {description.length}/500
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={onClose}
          >
            {en ? "Cancel" : "İptal"}
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            className="flex-1"
            isLoading={form.formState.isSubmitting}
          >
            {en ? "Report" : "Raporu Gönder"}
          </Button>
        </div>

        <p className="text-center text-xs text-subtle">
          {en
            ? "Reports are reviewed within 24-48 hours."
            : "Raporlar 24-48 saat içinde incelenir."}
        </p>
      </Form>
    </Modal>
  );
}
