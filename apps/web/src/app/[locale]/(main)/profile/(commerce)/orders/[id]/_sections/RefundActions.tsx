/** @format */

"use client";

import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { isDigitalOrder } from "@tarodan/types";
import { useTimingPolicy, useTimingValues } from "@/hooks/useTimingPolicy";
import { isOrderCancellable } from "../../_lib/types";
import {
  hasShipped,
  isPastRefundWindow,
  type OrderDetail,
} from "../_lib/types";

/**
 * Cancel / refund, buyer only. Before shipping "Cancel order" (one LINE,
 * refunded at once), after shipping "Request refund". Never for a digital
 * order (membership, boost). While the whole group is cancellable the single
 * cancel is also offered in the GROUP section; in a mixed cart (one line
 * shipped) only this block remains.
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
  const policy = useTimingPolicy();
  const timingValues = useTimingValues();

  if (
    !order.payment ||
    order.payment.status !== "completed" ||
    !order.isBuyer ||
    isDigitalOrder(order) ||
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
  const pastWindow = isPastRefundWindow(order, policy);

  // Pencereden sonra iade yok: kargo sonrası + pencere kapalı ise
  // iade butonu yerine "süre doldu" bilgisi göster.
  if (shipped && pastWindow) {
    return (
      <SectionCard title={t("order.refundWindowClosed")}>
        <p className="text-sm text-muted">
          {t("order.refundWindowPassed", timingValues)}
        </p>
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
