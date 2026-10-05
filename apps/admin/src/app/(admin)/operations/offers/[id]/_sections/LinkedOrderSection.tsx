"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { adminOrderCancelBlockerOf } from "@tarodan/types";
import { Badge, orderStatusConfig } from "@tarodan/ui";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";
import {
  cancelBlockerText,
  orderCancelReasonText,
} from "@/app/(admin)/operations/orders/[id]/_lib/cancel";
import { cancellationActorLabel } from "@/app/(admin)/operations/cancellations-refunds/_lib/cancellationView";
import {
  linkedOrderCancelEligibility,
  type OfferLinkedOrder,
} from "../../_lib/offers";

export function LinkedOrderSection({
  order,
}: {
  order: OfferLinkedOrder | null;
}) {
  const t = useTranslations();
  const eligibility = linkedOrderCancelEligibility({ order });
  const blocker = eligibility ? adminOrderCancelBlockerOf(eligibility) : null;
  const cancelReason = order ? orderCancelReasonText(order, t) : null;
  return (
    <SectionCard title={t("admin.operations.offers.linkedOrder")}>
      {order ? (
        <>
          <DataList columns={2}>
            <Field label={t("admin.operations.orders.orderNumber")}>
              <Link
                href={`/operations/orders/${order.id}`}
                className="font-mono text-primary-600 hover:underline"
              >
                {order.orderNumber}
              </Link>
            </Field>
            <Field label={t("common.status")}>
              <Badge
                status={order.status}
                config={statusConfig(orderStatusConfig, t)}
              />
            </Field>
            <Field label={t("common.amount")}>
              {fmtTry(order.totalAmount)}
            </Field>
            <Field label={t("admin.operations.offers.paymentStatus")}>
              {order.paymentStatus ?? t("admin.operations.offers.noPayment")}
            </Field>
            <Field label={t("admin.operations.common.createdAt")}>
              {fmtDateTime(order.createdAt)}
            </Field>
            {cancelReason && (
              <Field label={t("admin.operations.offers.cancelReason")}>
                {cancelReason}
              </Field>
            )}
            {order.cancelledBy && (
              <Field label={t("admin.operations.offers.cancelledBy")}>
                {cancellationActorLabel(order.cancelledBy, t)}
              </Field>
            )}
          </DataList>
          {blocker && (
            <p className="mt-3 text-xs text-muted">
              {cancelBlockerText(blocker, t)}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          {t("admin.operations.offers.noOrderYet")}
        </p>
      )}
    </SectionCard>
  );
}
