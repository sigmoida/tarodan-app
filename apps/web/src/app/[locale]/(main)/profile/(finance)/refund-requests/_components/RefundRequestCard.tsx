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
      className="group block rounded-lg border border-border bg-surface-elevated p-4 transition-all hover:border-primary-300 hover:shadow-md"
    >
      {/*
        Durum rozeti dar ekranda KENDİ satırına iner. Metinlerle aynı satırda
        kaldığında ("Ürün Tesliminden Sonra İade Açılacak" gibi uzun etiketler
        genişliğin yarısını yiyor) orta sütun eziliyor: iade numarası ikiye
        bölünüyor, ürün adı iki kelimede kırpılıyordu.
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3 sm:flex-1">
          <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface">
            {image ? (
              <OptimizedImage
                src={image}
                alt={request.order?.product?.title ?? ""}
                fill
                sizes="56px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <span className="text-2xl">📦</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm text-muted">
              {t("refund.label")} #{request.refundNumber}
            </p>
            <p className="mt-1 truncate font-medium text-heading transition-colors group-hover:text-primary-600">
              {request.order?.product?.title ?? "—"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("order.order")} {request.order?.orderNumber} ·{" "}
              {formatTL(Number(request.amount))}
            </p>
          </div>
        </div>
        <Badge
          variant={meta.variant}
          size="sm"
          className="self-start whitespace-normal text-left sm:flex-shrink-0"
        >
          {meta.labelKey ? t(meta.labelKey) : request.status}
        </Badge>
      </div>
    </Link>
  );
}
