/** @format */

"use client";

import { useEffect, useState } from "react";
import { TruckIcon } from "@heroicons/react/24/outline";
import { Button, Input, Modal } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
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
            placeholder={
              locale === "en"
                ? "Enter tracking number"
                : "Kargo takip numarasını girin"
            }
            className="font-mono"
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={shipMutation.isPending}
        >
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          className="flex-1 gap-2"
          onClick={submit}
          disabled={shipMutation.isPending || !trackingNumber.trim()}
        >
          <TruckIcon className="h-4 w-4" />
          {shipMutation.isPending
            ? locale === "en"
              ? "Saving..."
              : "Kaydediliyor..."
            : locale === "en"
              ? "Save & Ship"
              : "Kaydet ve Gönder"}
        </Button>
      </div>
    </Modal>
  );
}
