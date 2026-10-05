"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";

/**
 * SİPARİŞİ OLMAYAN teklifin iptali: gerekçe zorunlu (alıcı ve satıcıya
 * bildirim olarak gider). Canlı siparişi olan teklif bu diyaloğu açmaz;
 * sipariş iptal diyaloğunu (CancelOrderModal) açar.
 */
export function CancelOfferModal({
  open,
  onClose,
  offer,
}: {
  open: boolean;
  onClose: () => void;
  offer: { id: string };
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const cancel = useAdminMutation(
    () => adminApi.cancelOffer(offer.id, reason.trim()),
    {
      invalidates: ["offers", "orders"],
      successMessage: t("admin.operations.offers.cancelled"),
      errorMessage: t("admin.operations.offers.cancelFailed"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("admin.operations.offers.cancelTitle")}
      closeButtonDisabled={cancel.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => cancel.mutate()}
          confirmLabel={t("admin.operations.offers.cancel")}
          disabled={!reason.trim()}
          isLoading={cancel.isPending}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t("admin.operations.offers.cancelDescription")}
        </p>
        <Textarea
          label={t("admin.operations.offers.cancelReason")}
          placeholder={t("admin.operations.offers.cancelReasonPlaceholder")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={3}
          disabled={cancel.isPending}
        />
      </div>
    </Modal>
  );
}
