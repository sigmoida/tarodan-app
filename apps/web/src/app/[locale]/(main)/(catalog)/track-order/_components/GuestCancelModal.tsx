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
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type { MessageKey } from "@tarodan/i18n";
import { ordersApi } from "@/lib/api";
import type { OrderCancellationReason } from "@/lib/api/orders";

/**
 * Üye iptal modalıyla (CancelOrderModal) aynı neden listesi ve etiket haritası —
 * değerler paylaşılan BUYER_SELECTABLE_CANCELLATION_REASONS'tan türetilir,
 * elle kopya liste tutulmaz.
 */
const CANCELLATION_REASON_LABEL_KEY: Record<string, MessageKey> = {
  delivery_delayed: "order.cancelReasonDeliveryDelayed",
  wrong_product_selected: "order.cancelReasonWrongProductSelected",
  changed_mind: "order.cancelReasonChangedMind",
  wrong_card: "order.cancelReasonWrongCard",
  price_changed_mind: "order.cancelReasonPrice",
  unavailable_at_address: "order.cancelReasonUnavailableAtAddress",
};

interface GuestCancelModalProps {
  /** null → kapalı. Takip ekranındaki doğrulanmış sipariş no + e-posta. */
  target: { orderNumber: string; email: string } | null;
  onClose: () => void;
  /** Başarılı iptalden sonra takip verisini tazeler. */
  onCancelled: () => void;
}

/**
 * Misafir iptali (kargo öncesi): sunucu tarafı üye iptaliyle AYNI komuttur —
 * aynı sebep listesi, aynı kesinti politikası, aynı kargoya-devir kilidi.
 * Bu modal yalnız kimliği sipariş no + e-posta ile taşır.
 */
export default function GuestCancelModal({
  target,
  onClose,
  onCancelled,
}: GuestCancelModalProps) {
  const t = useTranslations();
  const [reasonCode, setReasonCode] =
    useState<OrderCancellationReason>("changed_mind");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason("");
    setReasonCode("changed_mind");
  }, [target?.orderNumber]);

  const cancel = useMutation({
    mutationFn: async () => {
      if (!target) return;
      await ordersApi.cancelGuest({
        orderNumber: target.orderNumber,
        email: target.email,
        reasonCode,
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success(t("order.orderCancelled"));
      onClose();
      onCancelled();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || t("order.cancelFailed"));
    },
  });

  const reasonOptions = BUYER_SELECTABLE_CANCELLATION_REASONS.map((value) => ({
    value: value as OrderCancellationReason,
    label: t(
      CANCELLATION_REASON_LABEL_KEY[value] ??
        orderCancellationReasonConfig[value].labelKey,
    ),
  }));

  return (
    <Modal
      isOpen={!!target}
      onClose={onClose}
      title={t("order.cancelOrder")}
      description={t("order.cancelRefundNotice")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={cancel.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => cancel.mutate()}
          cancelLabel={t("order.keepOrder")}
          confirmLabel={t("order.cancelOrder")}
          destructive
          isLoading={cancel.isPending}
        />
      }
    >
      {target && (
        <p className="mb-3 font-mono text-sm text-muted">
          {t("order.orderNumber")} #{target.orderNumber}
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
