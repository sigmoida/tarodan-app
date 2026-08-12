/** @format */

"use client";

import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { isOrderCancellable } from "../../_lib/types";
import {
  hasShipped,
  isMembershipOrder,
  isPastRefundWindow,
  type OrderDetail,
} from "../_lib/types";

/**
 * İptal / İade — sadece alıcı. Kargo öncesi "Siparişi İptal Et" (tek KALEM,
 * anında geri ödeme), kargo sonrası "İade Talep Et". Üyelik/dijital siparişler
 * hariç. Grubun tamamı iptal edilebilirken tekil iptal GRUP bölümünde de
 * sunulur; karışık sepette (bir kalem kargoda) yalnız bu blok kalır.
 */
export default function RefundActions({
  order,
  onRequestRefund,
  onCancelOrder,
  showLineCancel = false,
}: {
  order: OrderDetail;
  onRequestRefund: () => void;
  /** Tek kalem iptali (kargo öncesi) — showLineCancel açıkken gösterilir. */
  onCancelOrder?: () => void;
  showLineCancel?: boolean;
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

  // Kargo öncesi tek KALEM iptali: kalem taşıyıcıya devredilmediyse
  // (etiket kesilmiş olsa bile) iptal hâlâ mümkündür — iade akışına düşmez.
  if (showLineCancel && onCancelOrder && isOrderCancellable(order)) {
    return (
      <SectionCard title={t("order.cancelOrder")}>
        <p className="mb-4 text-sm text-muted">
          {t("order.cancelRefundNotice")}
        </p>
        <Button
          variant="danger"
          size="lg"
          className="w-full"
          onClick={onCancelOrder}
        >
          {t("order.cancelOrder")}
        </Button>
      </SectionCard>
    );
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

  // Kargo öncesi iptal (grup ya da tekil) GRUP ekranının bölümlerinden yapılır —
  // bu noktadan sonrası yalnız kargo sonrası iade talebini sunar.
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
