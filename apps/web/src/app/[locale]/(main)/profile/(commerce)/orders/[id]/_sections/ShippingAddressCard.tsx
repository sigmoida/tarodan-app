/** @format */

"use client";

import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { isMembershipOrder, type OrderDetail } from "../_lib/types";

/**
 * Teslimat adresi — sadece ödeme bekleyen alıcı değilse göster (alıcı için adres
 * ödeme kartının içinde). Üyelik/dijital siparişlerde teslimat adresi yoktur.
 */
export default function ShippingAddressCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  if (
    !order.shippingAddress ||
    isMembershipOrder(order) ||
    (order.isBuyer && order.status === "pending_payment")
  ) {
    return null;
  }
  const addr = order.shippingAddress;

  return (
    <SectionCard title={t("address.deliveryAddress")}>
      <div className="text-body">
        <p className="font-medium">{addr.title}</p>
        <p>{addr.addressLine1}</p>
        {addr.addressLine2 && <p>{addr.addressLine2}</p>}
        <p>
          {addr.district}, {addr.city} {addr.postalCode}
        </p>
      </div>
    </SectionCard>
  );
}
