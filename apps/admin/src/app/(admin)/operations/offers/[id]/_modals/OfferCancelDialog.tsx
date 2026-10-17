"use client";

import { CancelOrderModal } from "@/app/(admin)/operations/orders/[id]/_modals/CancelOrderModal";
import type { OfferCancelAction } from "../../_lib/offers";
import { CancelOfferModal } from "./CancelOfferModal";

/**
 * Teklif ekranının (detay + Teklifler sekmesi) iptal diyaloğu: canlı
 * siparişi olan teklifte sepet siparişiyle AYNI sipariş iptal diyaloğu
 * (aynı kural, aynı uç), siparişsiz teklifte teklif iptali.
 */
export function OfferCancelDialog({
  action,
  offerId,
  open,
  onClose,
}: {
  action: OfferCancelAction;
  offerId: string;
  open: boolean;
  onClose: () => void;
}) {
  if (action?.kind === "order") {
    return (
      <CancelOrderModal
        key={action.order.id}
        open={open}
        onClose={onClose}
        orderId={action.order.id}
        orderNumber={action.order.orderNumber}
        isOfferOrder
      />
    );
  }
  if (action?.kind === "offer") {
    return (
      <CancelOfferModal open={open} onClose={onClose} offer={{ id: offerId }} />
    );
  }
  return null;
}
