/** @format */

"use client";

import { useEffect, useState } from "react";
import {
  BUYER_SELECTABLE_CANCELLATION_REASONS,
  Modal,
  ModalFooter,
  Select,
  Textarea,
  orderCancellationReasonConfig,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import { useCancelGroup, useCancelOrder } from "../_hooks/useOrders";
import type { OrderCancellationReason } from "@/lib/api/orders";
import type { ServerOrderGroup } from "../_lib/types";

/** İptal hedefi: sepetin tamamı (grup) ya da tek sipariş KALEMİ. */
export type CancelTarget =
  | { kind: "group"; group: ServerOrderGroup }
  | { kind: "line"; orderId: string; orderNumber: string };

/**
 * Etiketler web'in next-intl anahtarlarından gelir; DEĞER listesi ise
 * @tarodan/ui'deki paylaşılan BUYER_SELECTABLE_CANCELLATION_REASONS'tan
 * türetilir (elle kopya listeler sessizce kayıyordu). Anahtarı olmayan yeni
 * bir enum değeri gelirse paylaşılan TR etiketi yedek olarak kullanılır.
 */
const CANCELLATION_REASON_LABEL_KEY: Record<string, MessageKey> = {
  delivery_delayed: "order.cancelReasonDeliveryDelayed",
  wrong_product_selected: "order.cancelReasonWrongProductSelected",
  changed_mind: "order.cancelReasonChangedMind",
  wrong_card: "order.cancelReasonWrongCard",
  price_changed_mind: "order.cancelReasonPrice",
  unavailable_at_address: "order.cancelReasonUnavailableAtAddress",
};

interface CancelOrderModalProps {
  target: CancelTarget | null;
  onClose: () => void;
}

/**
 * Tek iptal modalı: GRUP iptali (R4 — sepet bazında, kısmi iptal yok) ile tek
 * KALEM iptali aynı neden formunu paylaşır. Sentetik (grupsuz) tek sipariş ve
 * kalem iptali tekil iptal ucuna, grup iptali grup ucuna düşer. Liste kartı,
 * grup detay ekranı ve sipariş bloğu aynı modalı kullanır.
 */
export default function CancelOrderModal({
  target,
  onClose,
}: CancelOrderModalProps) {
  const t = useTranslations();
  const [reasonCode, setReasonCode] =
    useState<OrderCancellationReason>("changed_mind");
  const [reason, setReason] = useState("");
  const cancelGroup = useCancelGroup();
  const cancelOrder = useCancelOrder();
  const isPending = cancelGroup.isPending || cancelOrder.isPending;

  const targetKey = !target
    ? null
    : target.kind === "group"
      ? target.group.id
      : target.orderId;

  useEffect(() => {
    setReason("");
    setReasonCode("changed_mind");
  }, [targetKey]);

  const reasonOptions = BUYER_SELECTABLE_CANCELLATION_REASONS.map((value) => ({
    value: value as OrderCancellationReason,
    label: CANCELLATION_REASON_LABEL_KEY[value]
      ? t(CANCELLATION_REASON_LABEL_KEY[value])
      : (orderCancellationReasonConfig[value]?.label ?? value),
  }));

  const submit = () => {
    if (!target) return;
    if (target.kind === "line") {
      cancelOrder.mutate(
        { orderId: target.orderId, reasonCode, reason },
        { onSuccess: onClose },
      );
      return;
    }
    if (target.group.kind === "group") {
      cancelGroup.mutate(
        { groupId: target.group.id, reasonCode, reason },
        { onSuccess: onClose },
      );
    } else {
      const orderId = target.group.orders[0]?.id;
      if (!orderId) return;
      cancelOrder.mutate(
        { orderId, reasonCode, reason },
        { onSuccess: onClose },
      );
    }
  };

  const isMulti =
    target?.kind === "group" && (target.group.orders.length ?? 0) > 1;
  const title = isMulti ? t("order.cancelGroupTitle") : t("order.cancelOrder");

  return (
    <Modal
      isOpen={!!target}
      onClose={onClose}
      title={title}
      description={t("order.cancelRefundNotice")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          cancelLabel={t("order.keepOrder")}
          confirmLabel={title}
          destructive
          isLoading={isPending}
        />
      }
    >
      {target?.kind === "line" && (
        <p className="mb-3 font-mono text-sm text-muted">
          {t("order.orderNumber")} #{target.orderNumber}
        </p>
      )}
      {isMulti && (
        <p className="mb-3 text-sm font-medium text-danger-600">
          {t("order.cancelGroupAllNotice", {
            count: target?.kind === "group" ? target.group.orders.length : 0,
          })}
        </p>
      )}
      <Select
        value={reasonCode}
        onChange={(event) =>
          setReasonCode(event.target.value as OrderCancellationReason)
        }
      >
        {reasonOptions.map((preset) => (
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
