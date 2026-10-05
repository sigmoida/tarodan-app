"use client";

import { useTranslations } from "next-intl";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { TextLink } from "@/components/TextLink";
import { CellProduct, TruncatedText } from "@/components/table";
import type { PhysicalShipmentRow } from "../_lib/types";

/**
 * Always-open card under a parcel row: the koli's contents. Header carries the
 * koli number and the product/quantity summary; each line is one order inside
 * the parcel (product → order → quantity). Parties/carrier/status stay in the
 * row's own columns, so they are not repeated here.
 */
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
    <div className="bg-surface-alt/40 px-4 pb-4 pt-1">
      <Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border-subtle bg-surface-alt/60 px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-muted">
              {t("admin.operations.shipping.orders.contentsTitle")}
            </span>
            {shipment.packageNumber && (
              <span className="font-mono font-medium text-heading">
                {shipment.packageNumber}
              </span>
            )}
          </span>
          <span className="ml-auto text-xs text-muted">
            {t("admin.operations.shipping.orders.productSummary", {
              products: shipment.items.length,
              quantity: totalQuantity,
            })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px] divide-y divide-border-subtle">
            {shipment.items.map((item) => (
              <div
                key={item.orderId}
                className="grid grid-cols-[minmax(320px,1fr)_220px_110px] items-center gap-4 px-4 py-2.5"
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
                <DataList columns={1} className="min-w-0">
                  <Field
                    layout="stacked"
                    label={t("admin.operations.common.order")}
                  >
                    <TextLink
                      href={`/operations/orders/${item.orderId}`}
                      className="block min-w-0"
                    >
                      <TruncatedText className="font-mono text-sm">
                        {item.orderNumber}
                      </TruncatedText>
                    </TextLink>
                  </Field>
                </DataList>
                <DataList columns={1}>
                  <Field layout="stacked" label={t("common.quantity")}>
                    <span className="text-sm font-semibold tabular-nums text-body">
                      {item.quantity}
                    </span>
                  </Field>
                </DataList>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}
