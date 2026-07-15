/** @format */

"use client";

import toast from "react-hot-toast";
import { TruckIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
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
    return (
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <TruckIcon className="w-5 h-5" />
            {t("order.cargoReference")}
          </span>
        }
      >
        <p className="text-muted mb-4">{t("order.cargoRefInstructions")}</p>
        <div className="flex items-center gap-2 mb-4">
          <code className="flex-1 font-mono text-lg bg-surface-alt px-4 py-3 rounded-lg border border-border-default text-center font-semibold tracking-wider">
            {order.orderNumber}
          </code>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              navigator.clipboard.writeText(order.orderNumber);
              toast.success(t("order.orderNumberCopied"));
            }}
          >
            {t("common.copy")}
          </Button>
        </div>
        <p className="text-sm text-muted">
          {t("order.trackingAppearsAfterDropoff")}
        </p>
      </SectionCard>
    );
  }

  return null;
}
