import type {
  RawTradeItem,
  TradeDetail,
  TradeItem,
  TradeShipment,
} from "../types";
import type { ShipmentProductInfo } from "@/components/detail/ShipmentProducts";
import { getProductEffectivePrice } from "@/lib/product-price";

export function isShipmentDelivered(s: TradeShipment): boolean {
  return !!s.deliveredAt || s.status === "delivered";
}

const toProductInfo = (items: TradeItem[]): ShipmentProductInfo[] =>
  (items ?? [])
    .filter((i) => i.product)
    .map((i) => ({
      id: i.product.id,
      title: i.product.title,
      price: getProductEffectivePrice(i.product),
      image: i.product.images?.[0]?.url ?? null,
    }));

/**
 * Which product(s) a shipment/cargo carries — derived from its leg + party:
 * - to_warehouse: the SHIPPER sends their own items.
 * - from_warehouse: the RECIPIENT receives the OTHER party's items (the swap).
 * - return: the RECIPIENT gets their own items back.
 * Lets admins see which product each warehouse-bound / warehouse-outbound cargo
 * code belongs to.
 */
export function resolveShipmentProducts(
  s: TradeShipment,
  trade: TradeDetail,
): ShipmentProductInfo[] {
  const initId = trade.initiator?.id;
  const recvId = trade.receiver?.id;
  const initiator = toProductInfo(trade.initiatorItems);
  const receiver = toProductInfo(trade.receiverItems);
  const leg = s.leg ?? "to_warehouse";

  if (leg === "to_warehouse") {
    if (s.shipperId === initId) return initiator;
    if (s.shipperId === recvId) return receiver;
  } else if (leg === "from_warehouse") {
    if (s.recipientUserId === initId) return receiver;
    if (s.recipientUserId === recvId) return initiator;
  } else if (leg === "return") {
    if (s.recipientUserId === initId) return initiator;
    if (s.recipientUserId === recvId) return receiver;
  }
  return [];
}

/** Map of shipmentId → its carried products, for all shipments in a trade. */
export function productsByShipment(
  trade: TradeDetail,
): Record<string, ShipmentProductInfo[]> {
  return Object.fromEntries(
    (trade.shipments ?? []).map((s) => [
      s.id,
      resolveShipmentProducts(s, trade),
    ]),
  );
}

export function groupShipmentsByLeg(shipments: TradeShipment[] = []) {
  return shipments.reduce<Record<string, TradeShipment[]>>((acc, s) => {
    const leg = s.leg || "other";
    if (!acc[leg]) acc[leg] = [];
    acc[leg].push(s);
    return acc;
  }, {});
}

/**
 * Normalize the raw API payload: unwrap, derive initiator/receiver item lists
 * (from the arrays or by filtering flat `items` by side), and ensure shipments
 * is an array.
 */
export function mapTradePayload(payload: any): TradeDetail {
  const rawItems: RawTradeItem[] = Array.isArray(payload?.items)
    ? payload.items
    : [];
  const initiatorItems = Array.isArray(payload?.initiatorItems)
    ? payload.initiatorItems
    : rawItems.filter((item) => item.side === "initiator" && item.product);
  const receiverItems = Array.isArray(payload?.receiverItems)
    ? payload.receiverItems
    : rawItems.filter((item) => item.side === "receiver" && item.product);
  return {
    ...payload,
    initiatorItems,
    receiverItems,
    shipments: Array.isArray(payload?.shipments) ? payload.shipments : [],
  } as TradeDetail;
}
