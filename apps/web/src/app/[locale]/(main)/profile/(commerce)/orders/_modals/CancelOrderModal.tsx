/** @format */

"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Select, Spinner, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useCancelOrder } from "../_hooks/useOrders";
import type { OrderCancellationReason } from "@/lib/api/orders";

interface CancelOrderModalProps {
  order: { id: string } | null;
  onClose: () => void;
}

/** Structured pre-shipment cancellation shared by list and detail pages. */
export default function CancelOrderModal({
  order,
  onClose,
}: CancelOrderModalProps) {
  const t = useTranslations();
  const [reasonCode, setReasonCode] =
    useState<OrderCancellationReason>("changed_mind");
  const [reason, setReason] = useState("");
  const cancelMutation = useCancelOrder();

  useEffect(() => {
    setReason("");
    setReasonCode("changed_mind");
  }, [order?.id]);

  const presets = [
    {
      value: "delivery_delayed",
      label: t("order.cancelReasonDeliveryDelayed"),
    },
    {
      value: "wrong_product_selected",
      label: t("order.cancelReasonWrongProductSelected"),
    },
    { value: "changed_mind", label: t("order.cancelReasonChangedMind") },
    { value: "wrong_card", label: t("order.cancelReasonWrongCard") },
    {
      value: "price_changed_mind",
      label: t("order.cancelReasonPrice"),
    },
    {
      value: "unavailable_at_address",
      label: t("order.cancelReasonUnavailableAtAddress"),
    },
  ] satisfies Array<{ value: OrderCancellationReason; label: string }>;

  const submit = () => {
    if (!order) return;
    cancelMutation.mutate(
      { orderId: order.id, reasonCode, reason },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal isOpen={!!order} onClose={onClose} title={t("order.cancelOrder")}>
      <p className="mb-4 text-sm text-muted">{t("order.cancelRefundNotice")}</p>

      <Select
        value={reasonCode}
        onChange={(event) =>
          setReasonCode(event.target.value as OrderCancellationReason)
        }
      >
        {presets.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </Select>

      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder={t("order.cancelReasonNotePlaceholder")}
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
