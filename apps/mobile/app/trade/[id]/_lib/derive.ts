// trade + user'dan türetilen tüm görünüm değerleri — tek saf fonksiyon.
// (Ekran bunu bir kez çağırır; her türetmeyi JSX içinde tekrarlamaz.)
import type { Trade, TradeItem, TradeShipment } from './types';

export function deriveTradeView(trade: Trade, user: { id?: string } | null | undefined) {
  const isInitiator = user?.id === trade.initiatorId;
  const isReceiver = user?.id === trade.receiverId;
  const otherParty = isInitiator
    ? { id: trade.receiverId, displayName: trade.receiverName || 'Kullanıcı' }
    : { id: trade.initiatorId, displayName: trade.initiatorName || 'Kullanıcı' };

  const tradeItems: TradeItem[] = Array.isArray(trade.items) ? trade.items : [];
  const initiatorItems =
    Array.isArray(trade.initiatorItems) && trade.initiatorItems.length
      ? trade.initiatorItems
      : tradeItems.filter((item) => item.side === 'initiator');
  const receiverItems =
    Array.isArray(trade.receiverItems) && trade.receiverItems.length
      ? trade.receiverItems
      : tradeItems.filter((item) => item.side === 'receiver');

  const myItems = isInitiator ? initiatorItems : receiverItems;
  const theirItems = isInitiator ? receiverItems : initiatorItems;

  const sideTotal = (items: TradeItem[]) =>
    items.reduce((sum, item) => sum + Number(item.valueAtTrade) * (Number(item.quantity) || 1), 0);

  const shipments: TradeShipment[] = trade.shipments ?? [];
  const uid = user?.id;
  const myToWarehouseShipment = uid
    ? shipments.find((s) => s.direction === 'to_warehouse' && s.senderUserId === uid)
    : undefined;
  const otherToWarehouseShipment = uid
    ? shipments.find((s) => s.direction === 'to_warehouse' && s.senderUserId && s.senderUserId !== uid)
    : undefined;
  const myFromWarehouseShipment = uid
    ? shipments.find((s) => s.direction === 'from_warehouse' && s.recipientUserId === uid)
    : undefined;
  const otherFromWarehouseShipment = uid
    ? shipments.find((s) => s.direction === 'from_warehouse' && s.recipientUserId && s.recipientUserId !== uid)
    : undefined;
  const myReturnShipment = uid
    ? shipments.find((s) => s.direction === 'return' && (s.recipientUserId === uid || s.senderUserId === uid))
    : undefined;

  const cashPay = trade.cashPayment ?? null;
  const cashPaid = cashPay?.status === 'completed';
  const cashCommission = Number(cashPay?.commission ?? trade.cashCommission ?? 0);
  const cashTotal = Number(cashPay?.totalAmount ?? 0);

  const myTrackingNumber = isInitiator ? trade.initiatorTrackingNumber : trade.receiverTrackingNumber;
  const theirTrackingNumber = isInitiator ? trade.receiverTrackingNumber : trade.initiatorTrackingNumber;

  return {
    isInitiator,
    isReceiver,
    otherParty,
    myItems,
    theirItems,
    myTotal: sideTotal(myItems),
    theirTotal: sideTotal(theirItems),
    myToWarehouseShipment,
    otherToWarehouseShipment,
    myFromWarehouseShipment,
    otherFromWarehouseShipment,
    myReturnShipment,
    cashPaid,
    cashCommission,
    cashTotal,
    myTrackingNumber,
    theirTrackingNumber,
  };
}

export type TradeView = ReturnType<typeof deriveTradeView>;
