/** @format */

"use client";

import {
  CreditCardIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Alert, Button, Spinner } from "@tarodan/ui";
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
        <Alert
          variant="warning"
          className="mb-6"
          icon={
            <ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />
          }
          title={t("order.expiredReactivate")}
        >
          <div className="mt-3">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex items-center justify-center gap-2"
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
        </Alert>
      )}

      {/* İptal edilmiş sipariş bilgilendirme kartı: iptal durumunda kargo/ödeme/teslimat
			    kartları gizlendiği için sayfa boş kalmasın — iptal tarihi, sebebi ve iade durumu burada özetlenir. */}
      {order.status === "cancelled" && !order.canReactivate && (
        <Alert
          variant="danger"
          className="mb-6"
          icon={<XCircleIcon className="h-5 w-5 text-danger-600" />}
          title={t("order.orderWasCancelled")}
        >
          <div className="space-y-2 text-danger-700">
            {order.cancelledAt && (
              <p>
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
              return cancelMessage ? <p>{cancelMessage}</p> : null;
            })()}
            {order.payment?.status === "refunded" ||
            (order.status as string) === "refunded" ? (
              <p>{t("order.paymentRefunded")}</p>
            ) : order.payment?.status === "completed" ? (
              <p>{t("order.refundToOriginalMethod")}</p>
            ) : null}
          </div>
        </Alert>
      )}
    </>
  );
}
