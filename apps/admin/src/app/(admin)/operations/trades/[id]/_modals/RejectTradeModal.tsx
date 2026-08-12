"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

type FaultySide = "initiator" | "receiver" | "both" | "neither";

export function RejectTradeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  // Kusur ataması: red her iki ürünü de geri gönderdiği için "kimin yüzünden"
  // sorusu yalnız serbest metinde kalıyordu. Zorunlu seçim denetim kaydına yazılır.
  const [faultySide, setFaultySide] = useState<FaultySide | "">("");
  useEffect(() => {
    if (open) {
      setReason("");
      setFaultySide("");
    }
  }, [open]);

  const reject = useAdminMutation(
    () =>
      adminApi.rejectTrade(tradeId, reason.trim(), faultySide as FaultySide),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.rejectedMsg"),
      errorMessage: t("admin.operations.trades.rejectFailed"),
      onSuccess: onClose,
    },
  );

  const tooShort = reason.trim().length < 10;

  return (
    <Modal
      isOpen={open}
      onClose={() => !reject.isPending && onClose()}
      title={t("admin.operations.trades.rejectTitle")}
      closeButtonDisabled={reject.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => reject.mutate()}
          confirmLabel={t("admin.operations.trades.reject")}
          destructive
          isLoading={reject.isPending}
          disabled={tooShort || !faultySide}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-body">
          {t("admin.operations.trades.rejectBody")}
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.trades.faultySide")}{" "}
            <span className="text-danger-600">*</span>
          </label>
          <Select
            value={faultySide}
            onChange={(e) => setFaultySide(e.target.value as FaultySide)}
            disabled={reject.isPending}
            options={[
              { value: "", label: t("admin.operations.trades.faultySideHint") },
              {
                value: "initiator",
                label: t("admin.operations.trades.faultySideInitiator"),
              },
              {
                value: "receiver",
                label: t("admin.operations.trades.faultySideReceiver"),
              },
              {
                value: "both",
                label: t("admin.operations.trades.faultySideBoth"),
              },
              {
                value: "neither",
                label: t("admin.operations.trades.faultySideNeither"),
              },
            ]}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.trades.rejectReason")}{" "}
            <span className="text-danger-600">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={
              reason.length > 0 && tooShort
                ? "border-danger-400 focus:border-danger-500 focus:ring-danger-200"
                : undefined
            }
            rows={4}
            placeholder={t("admin.operations.trades.rejectPlaceholder")}
            disabled={reject.isPending}
          />
          <p className="mt-1 text-xs text-muted">
            {t("admin.operations.trades.charMinCounter", {
              count: reason.trim().length,
            })}
          </p>
        </div>
      </div>
    </Modal>
  );
}
