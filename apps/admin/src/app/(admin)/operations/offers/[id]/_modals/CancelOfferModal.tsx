"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Modal, ModalFooter, Textarea } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { cancelClosesOrder } from "../../_lib/offers";

/**
 * Teklif iptali: gerekçe zorunlu (alıcı ve satıcıya bildirim olarak gider).
 * Bağlı ödeme bekleyen sipariş varsa o da aynı işlemde kapanır.
 */
export function CancelOfferModal({
  open,
  onClose,
  offer,
}: {
  open: boolean;
  onClose: () => void;
  offer: { id: string; order: { status: string } | null };
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
        {cancelClosesOrder(offer) && (
          <Alert variant="warning">
            {t("admin.operations.offers.cancelWillCancelOrder")}
          </Alert>
        )}
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
