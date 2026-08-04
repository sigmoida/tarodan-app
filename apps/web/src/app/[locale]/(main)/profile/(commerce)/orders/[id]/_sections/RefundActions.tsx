/** @format */

"use client";

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
}: {
  order: OrderDetail;
  onRequestRefund: () => void;
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

  // Kargo öncesi iptal GRUP bölümünden yapılır (R4: iptal sepet bazında) —
  // bu bölüm yalnız kargo sonrası iade talebini sunar.
  if (!shipped) return null;

  return (
    <SectionCard title={t("order.refundTitle")}>
      <p className="text-sm text-muted mb-4">{t("order.refundShippedInfo")}</p>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={onRequestRefund}
      >
        {t("order.requestRefundTitle")}
      </Button>
    </SectionCard>
  );
}
