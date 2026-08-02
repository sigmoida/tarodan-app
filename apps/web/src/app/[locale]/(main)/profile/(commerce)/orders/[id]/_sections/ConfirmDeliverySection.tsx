/** @format */

"use client";

import { useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useConfirmDelivery } from "../_hooks/useOrderDetail";
import { isMembershipOrder, type OrderDetail } from "../_lib/types";

/**
 * Alıcının "Teslim Aldım" onayı. delivered → sipariş tamamlanır;
 * awaiting_buyer_confirmation (48s penceresi) → erken onay. Onay, satıcı
 * ödemesinin planlanmasını hızlandırır — bu yüzden onay modalı ile korunur.
 */
export default function ConfirmDeliverySection({
  order,
}: {
  order: OrderDetail;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const confirm = useConfirmDelivery();

  const early = order.status === "awaiting_buyer_confirmation";
  const visible =
    !!order.isBuyer &&
    !isMembershipOrder(order) &&
    (order.status === "delivered" || early) &&
    !order.activeRefundRequest;
  if (!visible) return null;

  return (
    <>
      <SectionCard title={t("order.confirmDeliveryTitle")}>
        <p className="mb-4 text-sm text-muted">
          {t("order.confirmDeliveryDescription")}
        </p>
        <Button
          variant="primary"
          size="sm"
          className="gap-1"
          onClick={() => setOpen(true)}
        >
          <CheckCircleIcon className="h-4 w-4" />
          {t("order.confirmDelivery")}
        </Button>
      </SectionCard>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t("order.confirmDeliveryTitle")}
        size="sm"
      >
        <p className="text-sm text-body">
          {t("order.confirmDeliveryDescription")}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            isLoading={confirm.isPending}
            onClick={() =>
              confirm.mutate(
                { orderId: order.id, early },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            {t("order.confirmDelivery")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
