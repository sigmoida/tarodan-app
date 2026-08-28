/** @format */

"use client";

import toast from "react-hot-toast";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Alert, Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useUpdateOrderStatus } from "../_hooks/useOrderDetail";
import type { OrderDetail } from "../_lib/types";

export default function SellerActions({
  order,
  showCargoRef = true,
}: {
  order: OrderDetail;
  /** Kargo referans kartı PAKET başına bir kez gösterilir (R6) — paketin ilk
   * siparişi dışında false geçilir; "Hazırlanıyor" aksiyonu sipariş başınadır. */
  showCargoRef?: boolean;
}) {
  const t = useTranslations();
  const updateStatus = useUpdateOrderStatus(order.id);

  if (!order.isSeller) return null;

  if (order.status === "paid") {
    return (
      <SectionCard title={t("order.sellerActions")}>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => updateStatus.mutate("preparing")}
        >
          {t("order.markAsPreparing")}
        </Button>
      </SectionCard>
    );
  }

  if (order.status === "preparing" && showCargoRef) {
    const cargoCode = order.shipment?.cargoCode ?? null;
    const dropoffReference =
      cargoCode ??
      order.shipment?.trackingNumber ??
      order.packageNumber ??
      null;
    return (
      <SectionCard title={t("order.cargoReference")}>
        {/* Şubede kodun tanınmadığı durumlar için satıcının söylemesi gereken
            cümle. Kartın EN ÜSTÜNDE ve `danger` tonunda duruyor: satıcı bunu
            şubeye gitmeden önce görmeli, aşağıdaki paketleme uyarısıyla aynı
            tonda olsaydı gözden kaçardı. */}
        <Alert
          variant="danger"
          className="mb-4"
          icon={<ExclamationTriangleIcon className="h-5 w-5 text-danger-600" />}
          title={t("order.cargoBranchIssueNotice")}
        />
        {/* Bu kod hangi koliye ait: aynı alıcının aynı sepetteki diğer ürünleri
            de bu kolide gider, tek etiketle gönderilir. */}
        {order.packageNumber && (
          <p className="mb-3 text-sm text-muted">
            {t("order.packageNumber")}:{" "}
            <span className="font-mono text-body">{order.packageNumber}</span>
          </p>
        )}
        {dropoffReference ? (
          <>
            <p className="text-muted mb-4">
              {cargoCode
                ? t("order.cargoCodeInstructions")
                : t("order.cargoRefInstructions")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-lg bg-surface-alt px-4 py-3 rounded-lg border border-border text-center font-semibold tracking-wider">
                {dropoffReference}
              </code>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  navigator.clipboard.writeText(dropoffReference);
                  toast.success(t("order.cargoCodeCopied"));
                }}
              >
                {t("common.copy")}
              </Button>
            </div>
            {!cargoCode && (
              <p className="mt-3 text-sm text-muted">
                {t("order.trackingAppearsAfterDropoff")}
              </p>
            )}
            {/* İnsani senaryolar A5/A6: tek koli-tek sipariş uyarısı + ücret bilgisi. */}
            <div className="mt-4 space-y-2">
              <Alert
                variant="warning"
                icon={
                  <ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />
                }
                title={t("order.cargoOneParcelPerOrder")}
              />
              <p className="text-xs text-muted">
                {t("order.cargoFeeCoveredNotice")}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{t("order.cargoCodePending")}</p>
        )}
      </SectionCard>
    );
  }

  return null;
}
