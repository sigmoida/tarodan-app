/** @format */

"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import OptimizedImage from "@/components/OptimizedImage";
import {
  CreditCardIcon,
  CalendarIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  Badge,
  Button,
  StatusBadge,
  paymentStatusConfig,
  orderStatusConfig,
  ThumbnailStack,
} from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import { formatTL } from "@/lib/format";
import {
  groupOrdersOf,
  paymentStatusEnLabels,
  type GroupOrder,
  type Payment,
  type PaymentActionCb,
} from "../_lib/types";

function Thumb({ src, alt }: { src?: string | null; alt: string }) {
  if (src) {
    return (
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
        <OptimizedImage
          src={src}
          alt={alt}
          fill
          sizes="48px"
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-surface-alt">
      <CreditCardIcon className="h-6 w-6 text-subtle" />
    </div>
  );
}

export default function PaymentCard({
  payment,
  currentUserId,
  onAction,
  pending,
}: {
  payment: Payment;
  currentUserId?: string;
  onAction: PaymentActionCb;
  pending: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const groupOrders = groupOrdersOf(payment);
  const isGroup = groupOrders.length > 0;
  // A group has no single order detail — its "all details" is the item list, so
  // the single "Detaylar" toggle reveals the items in place instead of navigating.
  const [open, setOpen] = useState(false);

  const statusLabel =
    locale === "en"
      ? paymentStatusEnLabels[payment.status] || payment.status
      : paymentStatusConfig[payment.status]?.label || payment.status;

  // Per-item display-status label (backend already sends the display status key,
  // consistent with the orders list: refund_requested / refunded / cancelled / …).
  const itemStatusLabel = (s: string): string =>
    (
      ({
        pending_payment: t("order.statusPending"),
        paid: t("order.statusPaid"),
        preparing: t("order.statusProcessing"),
        shipped: t("order.statusShipped"),
        delivered: t("order.statusDelivered"),
        awaiting_buyer_confirmation: t("order.statusAwaitingConfirmation"),
        completed: t("order.statusCompleted"),
        cancelled: t("order.statusCancelled"),
        refund_requested: t("order.refundInProgress"),
        refunded: t("order.statusRefunded"),
      }) as Record<string, string>
    )[s] ?? s;

  // "Kaçı iade/iptal oldu" özeti.
  const refundedCount = groupOrders.filter(
    (o) => o.status === "refunded" || o.status === "refund_requested",
  ).length;
  const cancelledCount = groupOrders.filter(
    (o) => o.status === "cancelled",
  ).length;

  const counterparty =
    payment.buyer && payment.seller
      ? currentUserId === payment.buyer.id
        ? { role: t("product.seller"), name: payment.seller.displayName }
        : { role: t("order.buyer"), name: payment.buyer.displayName }
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-4">
      <div className="flex items-start gap-4">
        {/* Thumbnail(s) */}
        {isGroup ? (
          <ThumbnailStack
            items={groupOrders}
            getKey={(o) => o.id}
            max={3}
            size="md"
            renderItem={(o) =>
              o.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.image}
                  alt={o.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <CreditCardIcon className="h-6 w-6 text-subtle" />
                </div>
              )
            }
          />
        ) : (
          <Thumb
            src={payment.product?.images?.[0]}
            alt={payment.product?.title ?? ""}
          />
        )}

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-heading">
            {payment.description ||
              payment.product?.title ||
              t("checkout.step2")}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {isGroup ? (
              <>
                {payment.orderNumber &&
                  (payment.orderId ? (
                    <Link
                      href={`/profile/orders/${payment.orderId}`}
                      className="font-mono font-medium text-primary-600 hover:text-primary-700"
                    >
                      {payment.orderNumber}
                    </Link>
                  ) : (
                    <span className="font-mono font-medium">
                      {payment.orderNumber}
                    </span>
                  ))}
                <span className="text-primary-600">
                  · {t("payment.itemsCount", { count: groupOrders.length })}
                </span>
              </>
            ) : payment.orderId ? (
              <Link
                href={`/profile/orders/${payment.orderId}`}
                className="font-medium text-primary-600 hover:text-primary-700"
              >
                #{payment.orderNumber}
              </Link>
            ) : payment.orderNumber ? (
              <span className="font-medium">#{payment.orderNumber}</span>
            ) : null}
            {counterparty && (
              <span>
                · {counterparty.role}: {counterparty.name}
              </span>
            )}
            <span className="uppercase">· {payment.provider}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-subtle">
            <CalendarIcon className="h-3.5 w-3.5" />
            {new Date(payment.createdAt).toLocaleDateString("tr-TR", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>

        {/* Amount + status */}
        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <span className="font-semibold text-heading">
            {formatTL(payment.amount)}
          </span>
          <StatusBadge
            status={payment.status}
            config={paymentStatusConfig}
            label={statusLabel}
            size="sm"
          />
        </div>
      </div>

      {payment.failureReason && (
        <p className="mt-2 text-xs text-danger-600">{payment.failureReason}</p>
      )}

      {/* Actions: for a group the item-count / refund summary sits on the LEFT and
          a single "Detaylar" toggle on the right — one control reveals the items. */}
      {(isGroup ||
        payment.status === "pending" ||
        payment.status === "failed" ||
        payment.orderId) && (
        <div
          className={`mt-3 flex items-center gap-2 border-t border-border pt-3 ${
            isGroup ? "justify-between" : "justify-end"
          }`}
        >
          {isGroup && (
            <span className="flex flex-wrap items-center gap-2 text-sm text-primary-600">
              {t("payment.viewItemsCount", { count: groupOrders.length })}
              {refundedCount > 0 && (
                <Badge variant="warning" size="sm">
                  {t("payment.itemsRefunded", { count: refundedCount })}
                </Badge>
              )}
              {cancelledCount > 0 && (
                <Badge variant="danger" size="sm">
                  {t("payment.itemsCancelled", { count: cancelledCount })}
                </Badge>
              )}
            </span>
          )}
          <div className="flex items-center gap-2">
            {/* group → toggle the item list; single order → navigate to its detail. */}
            {isGroup ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {t("common.details")}
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Button>
            ) : (
              payment.orderId && (
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <Link href={`/profile/orders/${payment.orderId}`}>
                    {t("common.details")}
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                </Button>
              )
            )}
            {payment.status === "pending" && (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => onAction("cancel", payment.id)}
              >
                {t("common.cancel")}
              </Button>
            )}
            {payment.status === "failed" && (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => onAction("retry", payment.id)}
              >
                {t("payment.retry")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cart (checkout_group) sub-orders — revealed in place by "Detaylar". */}
      {isGroup && open && (
        <div className="mt-2 space-y-2">
          {groupOrders.map((o: GroupOrder) => (
            <div
              key={o.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary-300"
            >
              <Thumb src={o.image} alt={o.title} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-heading">
                  {o.title}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  {o.orderNumber && <span>#{o.orderNumber}</span>}
                  {o.sellerName && (
                    <span>
                      · {t("product.seller")}: {o.sellerName}
                    </span>
                  )}
                </div>
                <div className="mt-1.5">
                  <StatusBadge
                    status={o.status}
                    config={orderStatusConfig}
                    label={itemStatusLabel(o.status)}
                    size="sm"
                  />
                </div>
              </div>
              <span className="flex-shrink-0 whitespace-nowrap text-sm font-semibold text-heading">
                {formatTL(o.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
