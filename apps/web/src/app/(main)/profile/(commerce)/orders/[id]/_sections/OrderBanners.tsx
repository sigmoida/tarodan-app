/** @format */

"use client";

import { CreditCardIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import { useReactivateOrder } from "../_hooks/useOrderDetail";
import { getCancelMessage, type OrderDetail } from "../_lib/types";

/**
 * Sayfa üstü bilgilendirme banner'ları:
 *  - Süre aşımına uğramış teklif siparişi → "Ödemeyi tamamla" (reactivate).
 *  - İptal edilmiş sipariş → iptal tarihi/sebebi + iade durumu özeti.
 */
export default function OrderBanners({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const locale = useLocale();
  const reactivate = useReactivateOrder(order.id);

  return (
    <>
      {/* İptal edilmiş teklif siparişi: alıcı ödemeyi tamamlamak için yeniden aktive edebilir.
			    canReactivate backend'de reactivate() ile birebir hesaplanır — buton yalnız gerçekten
			    yeniden aktive edilebilen siparişte çıkar. */}
      {order.canReactivate && (
        <div className="mb-6 p-4 bg-warning-50 border border-warning-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-warning-800 text-sm">
            {t("order.expiredReactivate")}
          </p>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="flex-shrink-0 flex items-center justify-center gap-2"
            onClick={() => reactivate.mutate()}
            disabled={reactivate.isPending}
          >
            {reactivate.isPending ? (
              <Spinner
                size="sm"
                color="border-surface-elevated border-t-transparent"
              />
            ) : (
              <CreditCardIcon className="w-5 h-5" />
            )}
            {t("order.completePayment")}
          </Button>
        </div>
      )}

      {/* İptal edilmiş sipariş bilgilendirme kartı: iptal durumunda kargo/ödeme/teslimat
			    kartları gizlendiği için sayfa boş kalmasın — iptal tarihi, sebebi ve iade durumu burada özetlenir. */}
      {order.status === "cancelled" && !order.canReactivate && (
        <div className="mb-6 p-5 bg-danger-50 border border-danger-200 rounded-xl">
          <div className="flex items-start gap-3">
            <XCircleIcon className="w-6 h-6 text-danger-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h2 className="text-base font-semibold text-danger-800">
                {t("order.orderWasCancelled")}
              </h2>
              {order.cancelledAt && (
                <p className="text-sm text-danger-700">
                  {t("order.cancelledOn")}
                  {new Date(order.cancelledAt).toLocaleDateString("tr-TR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {(() => {
                const cancelMessage = getCancelMessage(
                  order.cancelCategory,
                  order.isBuyer,
                  order.cancelReason,
                  locale,
                );
                return cancelMessage ? (
                  <p className="text-sm text-danger-700">{cancelMessage}</p>
                ) : null;
              })()}
              {order.payment?.status === "refunded" ||
              (order.status as string) === "refunded" ? (
                <p className="text-sm text-danger-700">
                  {t("order.paymentRefunded")}
                </p>
              ) : order.payment?.status === "completed" ? (
                <p className="text-sm text-danger-700">
                  {t("order.refundToOriginalMethod")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
