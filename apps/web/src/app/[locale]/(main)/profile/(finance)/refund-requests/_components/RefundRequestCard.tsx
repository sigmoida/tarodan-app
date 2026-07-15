/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import OptimizedImage from "@/components/OptimizedImage";
import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { formatTL } from "@/lib/format";
import { statusMetaOf } from "../_lib/refund-status";
import type { RefundRequest } from "../_lib/types";

export default function RefundRequestCard({
  request,
}: {
  request: RefundRequest;
}) {
  const t = useTranslations();
  const meta = statusMetaOf(request.status);
  const image = request.order?.product?.images?.[0];

  return (
    <Link
      href={`/profile/refund-requests/${request.id}`}
      className="block rounded-lg border border-border bg-surface-elevated p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
          {image ? (
            <OptimizedImage
              src={image}
              alt={request.order?.product?.title ?? ""}
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : (
            <span className="text-2xl">📦</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            {t("refund.label")} #{request.refundNumber}
          </p>
          <p className="mt-1 truncate font-medium text-heading">
            {request.order?.product?.title ?? "—"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t("order.order")} {request.order?.orderNumber} ·{" "}
            {formatTL(Number(request.amount))}
          </p>
        </div>
        <Badge variant={meta.variant} size="sm" className="flex-shrink-0">
          {meta.labelKey ? t(meta.labelKey) : request.status}
        </Badge>
      </div>
    </Link>
  );
}
