"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  offerStatusConfig,
  orderStatusConfig,
} from "@tarodan/ui";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { TextLink } from "@/components/TextLink";
import { col } from "@/components/table/columns";
import { statusConfig } from "@/lib/statusLabels";
import { ordersTabHref } from "@/app/(admin)/operations/orders/_lib/screenTabs";
import type { OfferRow } from "../../_lib/offers";
import type { AdminOfferDetail } from "../_lib/types";

/**
 * Ürüne verilen diğer teklifler (kim, ne zaman, tutar, durum, sipariş) ve rakip
 * kabul uyarısı: kabul tekelleştirmez, ürünü ilk ÖDEYEN alır.
 */
export function ProductOffersSection({
  productId,
  siblings,
  competing,
}: {
  productId: string;
  siblings: OfferRow[];
  competing: AdminOfferDetail["competing"];
}) {
  const t = useTranslations();
  const columns = useMemo(
    () => [
      col.link(t("admin.operations.common.buyer"), (s: OfferRow) => ({
        href: `/operations/offers/${s.id}`,
        label: s.buyer.displayName,
      })),
      col.money(t("common.amount"), (s: OfferRow) => s.amount),
      col.badge(t("common.status"), (s: OfferRow) => (
        <Badge status={s.status} config={statusConfig(offerStatusConfig, t)} />
      )),
      col.custom(t("admin.operations.common.order"), (s: OfferRow) =>
        s.order ? (
          <span className="inline-flex items-center gap-2">
            <TextLink href={`/operations/orders/${s.order.id}`} mono>
              {s.order.orderNumber}
            </TextLink>
            <Badge
              status={s.order.status}
              config={statusConfig(orderStatusConfig, t)}
            />
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
      ),
      col.date(t("common.date"), (s: OfferRow) => s.createdAt, {
        withTime: true,
      }),
    ],
    [t],
  );
  const showCompeting =
    competing.acceptedOffers > 1 || competing.pendingPaymentOrders > 1;
  return (
    <SectionCard
      title={t("admin.operations.offers.productOffersTitle", {
        count: siblings.length,
      })}
      actions={
        <TextLink
          href={ordersTabHref("offers", { productId })}
          className="text-sm"
        >
          {t("admin.operations.offers.viewAllForProduct")}
        </TextLink>
      }
    >
      {showCompeting && (
        <Alert variant="warning" className="mb-3">
          {t("admin.operations.offers.competingAccepted", {
            count: competing.acceptedOffers,
          })}
          {competing.pendingPaymentOrders > 0 && (
            <>
              {" · "}
              {t("admin.operations.offers.competingPending", {
                count: competing.pendingPaymentOrders,
              })}
            </>
          )}
        </Alert>
      )}
      {competing.soldOrder && (
        <Alert variant="info" className="mb-3">
          {t("admin.operations.offers.productSold")}{" "}
          <TextLink href={`/operations/orders/${competing.soldOrder.id}`} mono>
            {competing.soldOrder.orderNumber}
          </TextLink>
        </Alert>
      )}
      {siblings.length === 0 ? (
        <p className="text-sm text-muted">
          {t("admin.operations.offers.noOtherOffers")}
        </p>
      ) : (
        <DataTable
          dense
          columns={columns}
          data={siblings}
          getRowId={(s) => s.id}
        />
      )}
    </SectionCard>
  );
}
