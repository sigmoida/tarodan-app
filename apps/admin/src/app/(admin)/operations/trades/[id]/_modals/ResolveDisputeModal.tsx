"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

export function ResolveDisputeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const t = useTranslations();
  const [resolution, setResolution] = useState("complete_trade");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setResolution("complete_trade");
      setNote("");
    }
  }, [open]);

  const resolve = useAdminMutation(
    () => adminApi.resolveTradeDispute(tradeId, resolution, note.trim()),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.resolvedMsg"),
      errorMessage: t("admin.operations.trades.resolveFailed"),
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (note.trim().length < 10) {
      toast.error(t("admin.operations.trades.resolutionNoteMinLen"));
      return;
    }
    resolve.mutate();
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !resolve.isPending && onClose()}
      title={t("admin.operations.trades.resolveTitle")}
      closeButtonDisabled={resolve.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          confirmLabel={t("admin.operations.trades.resolve")}
          isLoading={resolve.isPending}
        />
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.trades.resolution")}
          </label>
          <Select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={resolve.isPending}
          >
            <option value="complete_trade">
              {t("admin.operations.trades.resolveComplete")}
            </option>
            <option value="compensate_initiator">
              {t("admin.operations.trades.compensateInitiator")}
            </option>
            <option value="compensate_receiver">
              {t("admin.operations.trades.compensateReceiver")}
            </option>
            <option value="compensate_both">
              {t("admin.operations.trades.compensateBoth")}
            </option>
          </Select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            {t("admin.operations.trades.resolutionNoteLabel")}
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("admin.operations.trades.resolutionPlaceholder")}
            disabled={resolve.isPending}
          />
        </div>
      </div>
    </Modal>
  );
}
