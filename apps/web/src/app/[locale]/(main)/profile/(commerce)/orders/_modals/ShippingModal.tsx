/** @format */

"use client";

import { useEffect, useState } from "react";
import { Input, Modal, ModalFooter } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useShipOrder } from "../_hooks/useOrders";

interface ShippingModalProps {
  orderId: string | null;
  onClose: () => void;
}

/** Seller adds a tracking number (fixed carrier) → ships the order. */
export default function ShippingModal({
  orderId,
  onClose,
}: ShippingModalProps) {
  const t = useTranslations();
  const [trackingNumber, setTrackingNumber] = useState("");
  const shipMutation = useShipOrder();

  useEffect(() => {
    setTrackingNumber("");
  }, [orderId]);

  const submit = () => {
    if (!orderId || !trackingNumber.trim()) return;
    shipMutation.mutate({ orderId, trackingNumber }, { onSuccess: onClose });
  };

  return (
    <Modal
      isOpen={!!orderId}
      onClose={onClose}
      title={t("order.addShippingInfo")}
      size="md"
      closeLabel={t("common.close")}
      dismissDisabled={shipMutation.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("order.saveAndShip")}
          isLoading={shipMutation.isPending}
          disabled={!trackingNumber.trim()}
        />
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-body">
            {t("order.shippingCompany")}
          </label>
          <div className="rounded-lg bg-surface-alt px-3 py-2 font-medium text-body">
            Sürat Kargo
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-body">
            {t("order.trackingNumber")} *
          </label>
          <Input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder={t("order.enterTrackingNumber")}
            className="font-mono"
          />
        </div>
      </div>
    </Modal>
  );
}
