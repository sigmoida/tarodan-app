/** @format */

"use client";

import { MapPinIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/ui";
import { isMembershipOrder, type OrderDetail } from "../_lib/types";

/**
 * Teslimat adresi — sadece ödeme bekleyen alıcı değilse göster (alıcı için adres
 * ödeme kartının içinde). Üyelik/dijital siparişlerde teslimat adresi yoktur.
 */
export default function ShippingAddressCard({ order }: { order: OrderDetail }) {
  if (
    !order.shippingAddress ||
    isMembershipOrder(order) ||
    (order.isBuyer && order.status === "pending_payment")
  ) {
    return null;
  }
  const addr = order.shippingAddress;

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <MapPinIcon className="w-5 h-5" />
          Teslimat Adresi
        </span>
      }
    >
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
