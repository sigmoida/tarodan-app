import type { Notification } from './types';

/** Bildirim data'sından mobil hedef rotayı türet (öncelik sırası korunur). */
export function routeForNotification(n: Notification): string | null {
  const d = n.data || {};
  if (d.orderId) return `/orders/${d.orderId}`;
  if (d.tradeId) return `/trade/${d.tradeId}`;
  if (d.offerId) return `/offers/${d.offerId}`;
  if (d.threadId) return `/messages/${d.threadId}`;
  if (d.productId) return `/product/${d.productId}`;
  if (d.collectionId) return `/collections/${d.collectionId}`;
  if (d.userId) return `/seller/${d.userId}`;
  return null;
}
