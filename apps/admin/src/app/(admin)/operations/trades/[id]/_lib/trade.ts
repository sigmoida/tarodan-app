import type { RawTradeItem, TradeDetail, TradeShipment } from '../types';

export function isShipmentDelivered(s: TradeShipment): boolean {
  return !!s.deliveredAt || s.status === 'delivered';
}

export function groupShipmentsByLeg(shipments: TradeShipment[] = []) {
  return shipments.reduce<Record<string, TradeShipment[]>>((acc, s) => {
    const leg = s.leg || 'other';
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
  const rawItems: RawTradeItem[] = Array.isArray(payload?.items) ? payload.items : [];
  const initiatorItems = Array.isArray(payload?.initiatorItems)
    ? payload.initiatorItems
    : rawItems.filter((item) => item.side === 'initiator' && item.product);
  const receiverItems = Array.isArray(payload?.receiverItems)
    ? payload.receiverItems
    : rawItems.filter((item) => item.side === 'receiver' && item.product);
  return {
    ...payload,
    initiatorItems,
    receiverItems,
    shipments: Array.isArray(payload?.shipments) ? payload.shipments : [],
  } as TradeDetail;
}
