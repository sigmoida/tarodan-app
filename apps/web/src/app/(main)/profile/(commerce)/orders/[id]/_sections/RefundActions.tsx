/** @format */

"use client";

import { ArrowUturnLeftIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmProvider";
import { useTranslations } from "next-intl";
import { useCancelOrder } from "../_hooks/useOrderDetail";
import {
  hasShipped,
  isMembershipOrder,
  isPastRefundWindow,
  type OrderDetail,
} from "../_lib/types";

/**
 * İptal / İade — sadece alıcı. Kargo öncesi "İptal Et" (anında geri ödeme),
 * kargo sonrası "İade Talep Et". Üyelik/dijital siparişler hariç.
 */
export default function RefundActions({
  order,
  onRequestRefund,
}: {
  order: OrderDetail;
  onRequestRefund: () => void;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const cancelOrder = useCancelOrder(order.id);

  if (
    !order.payment ||
    order.payment.status !== "completed" ||
    !order.isBuyer ||
    isMembershipOrder(order) ||
    order.status === "cancelled" ||
    order.status === "refunded" ||
    order.activeRefundRequest
  ) {
    return null;
  }

  const shipped = hasShipped(order);
  const pastWindow = isPastRefundWindow(order);

  // 14 günden sonra iade yok: kargo sonrası + pencere kapalı ise
  // iade butonu yerine "süre doldu" bilgisi göster.
  if (shipped && pastWindow) {
    return (
      <SectionCard title={t("order.refundWindowClosed")}>
        <p className="text-sm text-muted">{t("order.refundWindowPassed")}</p>
      </SectionCard>
    );
  }

  const handleCancel = async () => {
    if (
      !(await confirm({
        title: t("order.cancelOrder"),
        description: t("order.cancelOrderConfirm"),
        confirmLabel: t("order.cancelConfirmYes"),
        cancelLabel: t("order.cancelConfirmNo"),
        destructive: true,
      }))
    ) {
      return;
    }
    cancelOrder.mutate();
  };

  return (
    <SectionCard
      title={shipped ? t("order.refundTitle") : t("order.cancelOrder")}
    >
      <p className="text-sm text-muted mb-4">
        {shipped
          ? t("order.refundShippedInfo")
          : t("order.cancelNotShippedInfo")}
      </p>
      {shipped ? (
        <Button
          variant="secondary"
          size="lg"
          className="w-full flex items-center justify-center gap-2"
          onClick={onRequestRefund}
        >
          <ArrowUturnLeftIcon className="w-5 h-5" />
          {t("order.requestRefundTitle")}
        </Button>
      ) : (
        <Button
          variant="danger"
          size="lg"
          className="w-full flex items-center justify-center gap-2"
          onClick={handleCancel}
          disabled={cancelOrder.isPending}
        >
          {cancelOrder.isPending ? (
            <Spinner
              size="sm"
              color="border-surface-elevated border-t-transparent"
            />
          ) : (
            <XCircleIcon className="w-5 h-5" />
          )}
          {t("order.cancelOrder")}
        </Button>
      )}
    </SectionCard>
  );
}
