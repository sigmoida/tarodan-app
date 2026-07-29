/** @format */

"use client";

import { ArrowUturnLeftIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
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
  onCancel,
}: {
  order: OrderDetail;
  onRequestRefund: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

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
          onClick={onCancel}
        >
          <XCircleIcon className="w-5 h-5" />
          {t("order.cancelOrder")}
        </Button>
      )}
    </SectionCard>
  );
}
