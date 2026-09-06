"use client";

import { useState } from "react";
import { Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { reportStatusConfig, type ReportStatus } from "../../_lib/types";
import { CLOSING_STATUSES, reportStatusChoices } from "../../_lib/detail";

/**
 * Şikayeti sonuçlandırır. Açıklama alanı iç not DEĞİL: kapanış durumlarında
 * (çözüldü/reddedildi) API bu metni şikayet edene bildirim ve e-posta olarak
 * gönderir — bu yüzden uyarı yalnız o durumlarda gösterilir.
 */
export function ReportStatusModal({
  reportId,
  currentStatus,
  currentNote,
  onClose,
}: {
  reportId: string;
  currentStatus: ReportStatus;
  currentNote?: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [status, setStatus] = useState<ReportStatus>(currentStatus);
  const [adminNote, setAdminNote] = useState(currentNote ?? "");

  const update = useAdminMutation(
    () =>
      adminApi.updateUserReport(reportId, {
        status,
        // Boş metin de gönderilir: `undefined` geçilirse Prisma alanı hiç
        // yazmaz ve silinen açıklama kayıtta kalıp kullanıcıya gitmeye devam
        // ederdi. Kutuda ne görünüyorsa kayda giden odur.
        adminNote: adminNote.trim(),
      }),
    {
      invalidates: ["reports"],
      successMessage: t("admin.reports.statusModal.updated"),
      onSuccess: onClose,
    },
  );

  const notifiesReporter = CLOSING_STATUSES.includes(status);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.reports.statusModal.title")}
      size="md"
      closeButtonDisabled={update.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => update.mutate()}
          confirmLabel={t("common.update")}
          isLoading={update.isPending}
        />
      }
    >
      <div className="space-y-4">
        <Select
          label={t("admin.reports.statusModal.newStatus")}
          value={status}
          onChange={(e) => setStatus(e.target.value as ReportStatus)}
          options={reportStatusChoices(reportStatusConfig(t))}
        />
        <Textarea
          label={t("admin.reports.statusModal.noteLabel")}
          placeholder={t("admin.reports.statusModal.notePlaceholder")}
          helperText={
            notifiesReporter
              ? t("admin.reports.statusModal.noteHelp")
              : undefined
          }
          maxLength={500}
          rows={4}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
