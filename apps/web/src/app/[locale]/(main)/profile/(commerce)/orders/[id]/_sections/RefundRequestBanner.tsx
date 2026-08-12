/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import toast from "react-hot-toast";
import {
  ArrowUturnLeftIcon,
  ChevronRightIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui";
import { useTranslations } from "next-intl";
import { statusMetaOf } from "@/app/[locale]/(main)/profile/(finance)/refund-requests/_lib/refund-status";
import type { OrderDetail } from "../_lib/types";

export default function RefundRequestBanner({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const rr = order.activeRefundRequest;
  if (!rr) return null;

  const isReturnReady =
    rr.status === "return_shipment_open" && !!rr.returnTrackingNumber;
  // Durum etiketi tek kaynaktan: web'in refund-status modülü (liste ve detay
  // sayfalarıyla aynı eşleme) — buradaki üçüncü kopya kaldırıldı.
  const { labelKey } = statusMetaOf(rr.status);
  const lbl = labelKey ? t(labelKey) : rr.status;

  return (
    <div className="rounded-xl shadow-sm p-6 border border-border bg-surface-alt">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 text-heading">
            <ArrowUturnLeftIcon className="w-5 h-5" />
            {t("order.refundRequest")}
          </h2>
          <p className="text-sm text-muted mt-1">
            {rr.refundNumber} ·{" "}
            {new Date(rr.createdAt).toLocaleDateString(t("common.dateLocale"))}
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border bg-surface text-body border-border">
          {lbl}
        </span>
      </div>

      {isReturnReady &&
        (() => {
          // Şube kabulüne kadar OzelKargoTakipNo, kabulden sonra gerçek
          // KargoTakipNo gösterilir. Her iki değer de aynı gönderiyi temsil eder.
          const returnRef = rr.returnCargoCode ?? rr.returnTrackingNumber;
          return (
            <div className="bg-surface-elevated rounded-lg p-4 mb-3">
              <p className="text-sm text-body mb-2">
                {order.isBuyer
                  ? t("refund.dropOffAtSurat")
                  : t("refund.buyerGivenReturnLabel")}
              </p>
              {returnRef ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-lg font-bold text-heading break-all">
                      {returnRef}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(returnRef);
                        toast.success(t("common.copiedShort"));
                      }}
                      className="h-auto p-0 text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {t("common.copy")}
                    </Button>
                  </div>
                  {rr.returnProvider === "surat" && !rr.returnCargoCode && (
                    <p className="mt-2 text-xs text-muted">
                      {t("order.trackingAppearsAfterDropoff")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted italic">
                  {t("order.cargoCodePending")}
                </p>
              )}
            </div>
          );
        })()}

      {rr.returnProvider === "surat" && rr.returnCargoCode && (
        <a
          href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(rr.returnCargoCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mr-4"
        >
          <TruckIcon className="w-4 h-4" />
          {t("order.trackReturn")}
        </a>
      )}

      <ButtonLink
        href={`/profile/refund-requests/${rr.id}`}
        variant="outline"
        size="sm"
        className="gap-1"
      >
        {t("common.viewDetails")}
        <ChevronRightIcon className="h-4 w-4" />
      </ButtonLink>
    </div>
  );
}
