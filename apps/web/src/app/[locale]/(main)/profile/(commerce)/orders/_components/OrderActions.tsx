/** @format */

"use client";

import { TruckIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useTranslations } from "next-intl";
import {
  REVIEWABLE_STATUSES,
  getOrderProductId,
  hasShipped,
  isCancelledOrder,
  type Order,
  type OrderRole,
} from "../_lib/types";

/** The action wiring shared by every card (single + grouped), sans the order. */
export interface OrderActionHandlers {
  role: OrderRole;
  userEmail?: string;
  downloadingId: string | null;
  cancellingId: string | null;
  onInvoice: (id: string) => void;
  onReorder: (order: Order) => void;
  onCancel: (order: Order) => void;
  onShip: (order: Order) => void;
  onReview: (order: Order) => void;
}

interface OrderActionsProps extends OrderActionHandlers {
  order: Order;
}

/**
 * Single source of truth for an order's action buttons — every card (single or
 * grouped) renders through this. Visibility is computed once; a button is not
 * rendered when it doesn't apply. All buttons are `@tarodan/ui` primitives.
 */
export default function OrderActions({
  order,
  role,
  userEmail,
  downloadingId,
  cancellingId,
  onInvoice,
  onReorder,
  onCancel,
  onShip,
  onReview,
}: OrderActionsProps) {
  const t = useTranslations();

  const shipped = hasShipped(order);
  const cancelled = isCancelledOrder(order);
  const isBuyer = order.isBuyer !== false;
  const isSeller = !!order.isSeller;
  const hasProduct = !!getOrderProductId(order);
  const isTerminal = [
    "delivered",
    "completed",
    "cancelled",
    "refunded",
  ].includes(order.status);
  const refundId = order.activeRefundRequest?.id;

  const canReview =
    hasProduct &&
    isBuyer &&
    role !== "seller" &&
    REVIEWABLE_STATUSES.includes(order.status) &&
    (order.hasProductRating !== true || order.hasSellerRating !== true);

  const show = {
    track: isBuyer && shipped && !cancelled,
    invoiceBuyer:
      isBuyer &&
      ["paid", "preparing", "shipped", "delivered", "completed"].includes(
        order.status,
      ),
    reorder: isBuyer && hasProduct && isTerminal,
    refundLink: !!refundId,
    cancel:
      !refundId &&
      isBuyer &&
      ["paid", "preparing"].includes(order.status) &&
      !shipped,
    requestRefund:
      !refundId &&
      isBuyer &&
      shipped &&
      !["cancelled", "refunded"].includes(order.status),
    sellerShip:
      isSeller &&
      ["paid", "preparing"].includes(order.status) &&
      !order.shipment,
    sellerInvoice:
      isSeller && ["paid", "preparing", "shipped"].includes(order.status),
    review: canReview,
  };

  const trackHref = `/track-order?orderNumber=${encodeURIComponent(
    order.orderNumber,
  )}&email=${encodeURIComponent(userEmail || "")}`;
  const downloading = downloadingId === order.id;
  const cancelling = cancellingId === order.id;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <ButtonLink
        href={`/profile/orders/${order.id}`}
        variant="secondary"
        size="sm"
      >
        {t("common.details")}
      </ButtonLink>

      {show.track && (
        <ButtonLink href={trackHref} variant="outline" size="sm">
          {t("order.trackOrder")}
        </ButtonLink>
      )}

      {show.invoiceBuyer && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onInvoice(order.id)}
          disabled={downloading}
        >
          {downloading ? t("payment.downloading") : t("order.downloadInvoice")}
        </Button>
      )}

      {show.reorder && (
        <Button variant="primary" size="sm" onClick={() => onReorder(order)}>
          {t("order.reorder")}
        </Button>
      )}

      {show.refundLink ? (
        <ButtonLink
          href={`/profile/refund-requests/${refundId}`}
          variant="outline"
          size="sm"
        >
          {t("order.viewRefundRequest")}
        </ButtonLink>
      ) : (
        <>
          {show.cancel && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => onCancel(order)}
              disabled={cancelling}
            >
              {cancelling ? t("common.cancelling") : t("order.cancelShort")}
            </Button>
          )}
          {show.requestRefund && (
            <ButtonLink
              href={`/profile/orders/${order.id}`}
              variant="secondary"
              size="sm"
            >
              {t("order.requestRefund")}
            </ButtonLink>
          )}
        </>
      )}

      {show.sellerShip && (
        <Button
          variant="primary"
          size="sm"
          className="gap-1"
          onClick={() => onShip(order)}
        >
          <TruckIcon className="h-4 w-4" />
          {t("order.addShippingInfo")}
        </Button>
      )}

      {show.sellerInvoice && (
        <Button
          variant="secondary"
          size="sm"
          className="gap-1"
          onClick={() => onInvoice(order.id)}
          disabled={downloading}
        >
          <DocumentTextIcon className="h-4 w-4" />
          {t("order.invoice")}
        </Button>
      )}

      {show.review && (
        <Button
          variant="primary"
          size="sm"
          className="gap-1"
          onClick={() => onReview(order)}
        >
          <StarIcon className="h-4 w-4" />
          {t("review.writeReview")}
        </Button>
      )}
    </div>
  );
}
