"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  offerStatusConfig,
  orderStatusConfig,
} from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";
import type { OfferRow } from "../../../_lib/offers";
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
  const showCompeting =
    competing.acceptedOffers > 1 || competing.pendingPaymentOrders > 1;
  return (
    <SectionCard
      title={t("admin.operations.offers.productOffersTitle", {
        count: siblings.length,
      })}
      actions={
        <Link
          href={`/operations/orders?tab=teklifler&productId=${productId}`}
          className="text-sm text-primary-600 hover:underline"
        >
          {t("admin.operations.offers.viewAllForProduct")}
        </Link>
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
          <Link
            href={`/operations/orders/${competing.soldOrder.id}`}
            className="font-mono underline"
          >
            {competing.soldOrder.orderNumber}
          </Link>
        </Alert>
      )}
      {siblings.length === 0 ? (
        <p className="text-sm text-muted">
          {t("admin.operations.offers.noOtherOffers")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-3">
                  {t("admin.operations.common.buyer")}
                </th>
                <th className="py-1 pr-3">{t("common.amount")}</th>
                <th className="py-1 pr-3">{t("common.status")}</th>
                <th className="py-1 pr-3">
                  {t("admin.operations.common.order")}
                </th>
                <th className="py-1 pr-3">{t("common.date")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {siblings.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/operations/orders/offers/${s.id}`}
                      className="text-primary-600 hover:underline"
                    >
                      {s.buyer.displayName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmtTry(s.amount)}</td>
                  <td className="py-2 pr-3">
                    <Badge
                      status={s.status}
                      config={statusConfig(offerStatusConfig, t)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {s.order ? (
                      <span className="inline-flex items-center gap-2">
                        <Link
                          href={`/operations/orders/${s.order.id}`}
                          className="font-mono text-primary-600 hover:underline"
                        >
                          {s.order.orderNumber}
                        </Link>
                        <Badge
                          status={s.order.status}
                          config={statusConfig(orderStatusConfig, t)}
                        />
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {fmtDateTime(s.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
