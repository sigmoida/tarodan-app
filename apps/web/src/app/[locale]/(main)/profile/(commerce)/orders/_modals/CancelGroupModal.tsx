/** @format */

"use client";

import { useEffect, useState } from "react";
import { Modal, ModalFooter, Select, Textarea } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useCancelGroup, useCancelOrder } from "../_hooks/useOrders";
import type { OrderCancellationReason } from "@/lib/api/orders";
import type { ServerOrderGroup } from "../_lib/types";

interface CancelGroupModalProps {
  group: ServerOrderGroup | null;
  onClose: () => void;
}

/**
 * GRUP iptali (R4): iptal SEPET bazındadır — modal grubun tamamını iptal eder
 * (kısmi iptal yok). Sentetik (grupsuz) tek siparişte tekil iptal ucuna düşer.
 * Liste kartı ve grup detay ekranı aynı modalı paylaşır.
 */
export default function CancelGroupModal({
  group,
  onClose,
}: CancelGroupModalProps) {
  const t = useTranslations();
  const [reasonCode, setReasonCode] =
    useState<OrderCancellationReason>("changed_mind");
  const [reason, setReason] = useState("");
  const cancelGroup = useCancelGroup();
  const cancelOrder = useCancelOrder();
  const isPending = cancelGroup.isPending || cancelOrder.isPending;

  useEffect(() => {
    setReason("");
    setReasonCode("changed_mind");
  }, [group?.id]);

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
    if (!group) return;
    if (group.kind === "group") {
      cancelGroup.mutate(
        { groupId: group.id, reasonCode, reason },
        { onSuccess: onClose },
      );
    } else {
      const orderId = group.orders[0]?.id;
      if (!orderId) return;
      cancelOrder.mutate(
        { orderId, reasonCode, reason },
        { onSuccess: onClose },
      );
    }
  };

  const isMulti = (group?.orders.length ?? 0) > 1;

  return (
    <Modal
      isOpen={!!group}
      onClose={onClose}
      title={isMulti ? t("order.cancelGroupTitle") : t("order.cancelOrder")}
      description={t("order.cancelRefundNotice")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          cancelLabel={t("order.keepOrder")}
          confirmLabel={
            isMulti ? t("order.cancelGroupTitle") : t("order.cancelOrder")
          }
          destructive
          isLoading={isPending}
        />
      }
    >
      {isMulti && (
        <p className="mb-3 text-sm font-medium text-danger-600">
          {t("order.cancelGroupAllNotice", {
            count: group?.orders.length ?? 0,
          })}
        </p>
      )}
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
    </Modal>
  );
}
