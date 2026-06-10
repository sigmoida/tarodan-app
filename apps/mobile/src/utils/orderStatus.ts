/**
 * API (Prisma OrderStatus) ↔ mobil sipariş listesi chip'leri
 */
export type UiOrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled'
  | 'refunded';

/** API'den gelen status → liste/detay chip mantığı */
export function apiStatusToUi(api: string | undefined | null): UiOrderStatus {
  switch (api) {
    case 'pending_payment':
      return 'pending';
    case 'paid':
    case 'preparing':
      return 'processing';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'awaiting_buyer_confirmation':
      return 'awaiting_confirmation';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'refund_requested':
    case 'refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}

/**
 * GET /orders?status= için tek değer (Nest OrderStatus enum).
 * "Hazırlanıyor" = paid + preparing → status göndermeden çekip istemcide süzülür.
 */
export function uiFilterToApiStatusParam(
  filter: 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed'
): string | undefined {
  switch (filter) {
    case 'pending':
      return 'pending_payment';
    case 'processing':
      return undefined;
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'completed':
      return 'completed';
    default:
      return undefined;
  }
}
