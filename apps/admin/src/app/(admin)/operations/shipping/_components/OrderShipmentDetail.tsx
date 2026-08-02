"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CellProduct, TruncatedText } from "@/components/table";
import type { PhysicalShipmentRow } from "../_lib/types";

export function OrderShipmentDetail({
  shipment,
}: {
  shipment: PhysicalShipmentRow;
}) {
  const t = useTranslations();
  const totalQuantity = shipment.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return (
    <div className="bg-surface-alt/40 px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-heading">
          {t("admin.operations.shipping.orders.contentsTitle")}
        </h3>
        <span className="text-xs text-muted">
          {t("admin.operations.shipping.orders.productSummary", {
            products: shipment.items.length,
            quantity: totalQuantity,
          })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[minmax(360px,1fr)_240px_100px] gap-4 border-b border-border-subtle px-4 py-2 text-xs font-medium text-muted">
            <span>{t("admin.operations.shipping.orders.products")}</span>
            <span>{t("admin.operations.common.order")}</span>
            <span>{t("common.quantity")}</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {shipment.items.map((item) => (
              <div
                key={item.orderId}
                className="grid grid-cols-[minmax(360px,1fr)_240px_100px] items-center gap-4 px-4 py-3"
              >
                <CellProduct
                  title={
                    item.productTitle ??
                    t("admin.operations.shipping.orders.unknownProduct")
                  }
                  image={item.productImageUrl}
                  href={
                    item.productId
                      ? `/catalog/products/${item.productId}`
                      : undefined
                  }
                />
                <Link
                  href={`/operations/orders/${item.orderId}`}
                  className="block min-w-0 text-primary-600 hover:underline"
                >
                  <TruncatedText className="font-mono">
                    {`#${item.orderNumber}`}
                  </TruncatedText>
                </Link>
                <span className="whitespace-nowrap tabular-nums text-body">
                  {item.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
