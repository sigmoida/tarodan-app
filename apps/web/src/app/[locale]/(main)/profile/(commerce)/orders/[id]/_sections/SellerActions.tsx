/** @format */

"use client";

import toast from "react-hot-toast";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Alert, Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useUpdateOrderStatus } from "../_hooks/useOrderDetail";
import type { OrderDetail } from "../_lib/types";

export default function SellerActions({ order }: { order: OrderDetail }) {
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

  if (order.status === "preparing") {
    const cargoCode = order.shipment?.cargoCode ?? null;
    return (
      <SectionCard title={t("order.cargoReference")}>
        {cargoCode ? (
          <>
            <p className="text-muted mb-4">
              {t("order.cargoCodeInstructions")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-lg bg-surface-alt px-4 py-3 rounded-lg border border-border text-center font-semibold tracking-wider">
                {cargoCode}
              </code>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  navigator.clipboard.writeText(cargoCode);
                  toast.success(t("order.cargoCodeCopied"));
                }}
              >
                {t("common.copy")}
              </Button>
            </div>
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
