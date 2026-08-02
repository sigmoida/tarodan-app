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
  onInvoice: (id: string) => void;
  onReorder: (order: Order) => void;
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
  onInvoice,
  onReorder,
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
    invoiceBuyer:
      isBuyer &&
      ["paid", "preparing", "shipped", "delivered", "completed"].includes(
        order.status,
      ),
    reorder: isBuyer && hasProduct && isTerminal,
    refundLink: !!refundId,
    requestRefund:
      !refundId &&
      isBuyer &&
      shipped &&
      !["cancelled", "refunded"].includes(order.status),
    sellerInvoice:
      isSeller && ["paid", "preparing", "shipped"].includes(order.status),
    review: canReview,
  };

  const downloading = downloadingId === order.id;

  // Variant scheme: one filled `primary` CTA per state, `danger` for the
  // destructive action, and a uniform `outline` for every neutral/navigational
  // action. Reorder yields its primary emphasis to Review when both apply, so
  // there is never more than one orange button.
  const reorderVariant = show.review ? "outline" : "primary";

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {show.invoiceBuyer && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onInvoice(order.id)}
          disabled={downloading}
        >
          {downloading ? t("payment.downloading") : t("order.downloadInvoice")}
        </Button>
      )}

      {show.reorder && (
        <Button
          variant={reorderVariant}
          size="sm"
          onClick={() => onReorder(order)}
        >
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
        show.requestRefund && (
          <ButtonLink
            href={`/profile/orders/${order.id}`}
            variant="outline"
            size="sm"
          >
            {t("order.requestRefund")}
          </ButtonLink>
        )
      )}

      {isSeller && order.status === "preparing" && (
        <ButtonLink
          href={`/profile/orders/${order.id}`}
          variant="primary"
          size="sm"
          className="gap-1"
        >
          <TruckIcon className="h-4 w-4" />
          {t("order.viewCargoCode")}
        </ButtonLink>
      )}

      {show.sellerInvoice && (
        <Button
          variant="outline"
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
