"use client";

import { useMemo } from "react";
import { z } from "zod";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Radio } from "@tarodan/ui";
import { FormModal, FormTextarea, useZodForm } from "@tarodan/ui/form";
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
  labelKey: string;
}[] = [
  { value: "spam", labelKey: "report.reasonSpam" },
  { value: "inappropriate_content", labelKey: "report.reasonInappropriate" },
  { value: "harassment", labelKey: "report.reasonHarassment" },
  { value: "fake_product", labelKey: "report.reasonFakeProduct" },
  { value: "scam", labelKey: "report.reasonScam" },
  { value: "other", labelKey: "report.reasonOther" },
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
}: ReportModalProps) {
  const t = useTranslations();

  const schema = useMemo(
    () =>
      z.object({
        reason: z.enum(REASON_VALUES, {
          errorMap: () => ({
            message: t("report.selectReason"),
          }),
        }),
        description: z.string().trim().max(500).optional().or(z.literal("")),
      }),
    [t],
  );
  type ReportValues = z.infer<typeof schema>;

  const form = useZodForm(schema, { defaultValues: { description: "" } });
  const reason = form.watch("reason");
  const description = form.watch("description") ?? "";

  const title = (() => {
    switch (entityType) {
      case "product":
        return t("report.reportListing");
      case "user":
        return t("report.reportUser");
      case "collection":
        return t("report.reportCollection");
      case "message":
        return t("report.reportMessage");
      default:
        return t("report.report");
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
      toast.success(t("report.submitSuccess"));
      form.reset({ description: "" });
      onClose();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Report submission failed:", error);
      const errorMsg = error.response?.data?.message;
      const displayMsg = Array.isArray(errorMsg) ? errorMsg[0] : errorMsg;
      toast.error(displayMsg || t("report.submitFailed"));
    }
  };

  return (
    <FormModal
      open={isOpen}
      onClose={onClose}
      title={title}
      form={form}
      onSubmit={onSubmit}
      size="sm"
      submitLabel={t("report.submit")}
      cancelLabel={t("common.cancel")}
      closeLabel={t("common.close")}
      discardConfirmation={false}
    >
      {entityName && (
        <div className="rounded-lg bg-surface p-2">
          <p className="text-xs text-muted">{t("report.reporting")}</p>
          <p className="truncate text-sm font-medium text-heading">
            {entityName}
          </p>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-body">
          {t("common.reason")} <span className="text-danger-500">*</span>
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
                {t(r.labelKey as Parameters<typeof t>[0])}
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
          label={t("report.detailsLabel")}
          placeholder={t("report.detailsPlaceholder")}
          rows={2}
          maxLength={500}
        />
        <p className="mt-0.5 text-right text-xs text-subtle">
          {description.length}/500
        </p>
      </div>

      <p className="text-center text-xs text-subtle">
        {t("report.reviewNotice")}
      </p>
    </FormModal>
  );
}
