/** @format */

"use client";

import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { isDigitalOrder } from "@tarodan/types";
import type { OrderDetail } from "../_lib/types";

/**
 * Delivery address, except for a buyer awaiting payment (the payment card
 * holds the address then). A digital order (membership, boost) has no
 * delivery address.
 */
export default function ShippingAddressCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  if (
    !order.shippingAddress ||
    isDigitalOrder(order) ||
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
