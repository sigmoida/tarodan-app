/** @format */

"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Spinner, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useCancelOrder } from "../_hooks/useOrders";
import type { Order } from "../_lib/types";

interface CancelOrderModalProps {
  order: Order | null;
  onClose: () => void;
}

/** Pre-shipment buyer cancellation — optional reason (presets + free text). */
export default function CancelOrderModal({
  order,
  onClose,
}: CancelOrderModalProps) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  const cancelMutation = useCancelOrder();

  useEffect(() => {
    setReason("");
  }, [order?.id]);

  const presets = [
    t("order.cancelReasonChangedMind"),
    t("order.cancelReasonWrongItem"),
    t("order.cancelReasonFoundCheaper"),
    t("order.cancelReasonTooSlow"),
  ];

  const submit = () => {
    if (!order) return;
    cancelMutation.mutate(
      { orderId: order.id, reason },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal isOpen={!!order} onClose={onClose} title={t("order.cancelOrder")}>
      <p className="mb-4 text-sm text-muted">{t("order.cancelRefundNotice")}</p>

      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={reason === preset ? "primary" : "outline"}
            className="rounded-full"
            onClick={() => setReason(preset)}
          >
            {preset}
          </Button>
        ))}
      </div>

      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder={t("order.cancelReasonPlaceholder")}
        rows={3}
        maxLength={500}
      />
      <p className="mt-1 text-right text-xs text-subtle">{reason.length}/500</p>

      <div className="mt-4 flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={cancelMutation.isPending}
        >
          {t("order.keepOrder")}
        </Button>
        <Button
          variant="danger"
          className="flex-1 gap-2"
          onClick={submit}
          disabled={cancelMutation.isPending}
        >
          {cancelMutation.isPending && (
            <Spinner
              size="sm"
              color="border-surface-elevated border-t-transparent"
            />
          )}
          {t("order.cancelOrder")}
        </Button>
      </div>
    </Modal>
  );
}
