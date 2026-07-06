import { TradeStatus } from '@prisma/client';

/**
 * Trade state machine — single source of truth for allowed transitions.
 * Exported as a top-level const so unit tests can lock the rules without
 * instantiating TradeService.
 */
export const TRADE_VALID_TRANSITIONS: Record<TradeStatus, TradeStatus[]> = {
  [TradeStatus.pending]: [
    TradeStatus.accepted,
    TradeStatus.awaiting_payment,
    TradeStatus.shipping_to_warehouse,
    TradeStatus.rejected,
    TradeStatus.cancelled,
  ],
  // Legacy accepted state (peer-to-peer flow) — kept for backwards compat
  [TradeStatus.accepted]: [
    TradeStatus.initiator_shipped,
    TradeStatus.receiver_shipped,
    TradeStatus.awaiting_payment,
    TradeStatus.shipping_to_warehouse,
    TradeStatus.cancelled,
  ],
  [TradeStatus.rejected]: [], // Terminal state
  // Legacy peer-to-peer shipping states
  [TradeStatus.initiator_shipped]: [
    TradeStatus.both_shipped,
    TradeStatus.cancelled,
  ],
  [TradeStatus.receiver_shipped]: [
    TradeStatus.both_shipped,
    TradeStatus.cancelled,
  ],
  [TradeStatus.both_shipped]: [
    TradeStatus.initiator_received,
    TradeStatus.receiver_received,
    TradeStatus.disputed,
  ],
  [TradeStatus.initiator_received]: [
    TradeStatus.completed,
    TradeStatus.disputed,
  ],
  [TradeStatus.receiver_received]: [
    TradeStatus.completed,
    TradeStatus.disputed,
  ],
  // New escrow flow states
  [TradeStatus.awaiting_payment]: [
    TradeStatus.shipping_to_warehouse,
    TradeStatus.cancelled,
  ],
  [TradeStatus.shipping_to_warehouse]: [
    TradeStatus.at_warehouse,
    TradeStatus.cancelled,
    TradeStatus.returning,
  ],
  [TradeStatus.at_warehouse]: [
    TradeStatus.admin_reviewing,
    TradeStatus.shipping_to_recipients,
    TradeStatus.returning,
  ],
  [TradeStatus.admin_reviewing]: [
    TradeStatus.shipping_to_recipients,
    TradeStatus.returning,
  ],
  [TradeStatus.shipping_to_recipients]: [
    TradeStatus.completed,
    TradeStatus.disputed,
  ],
  [TradeStatus.returning]: [TradeStatus.cancelled],
  [TradeStatus.completed]: [], // Terminal state
  [TradeStatus.cancelled]: [], // Terminal state
  [TradeStatus.disputed]: [
    TradeStatus.completed,
    TradeStatus.cancelled,
  ],
};

/**
 * Pure cancel-eligibility check shared by the service and unit tests.
 * Returns true when the viewer is a participant AND the trade is in a state
 * where user-initiated cancel is still allowed (no warehouse arrival yet).
 */
export function computeTradeCanCancel(
  trade: {
    status: TradeStatus | string;
    initiatorId: string;
    receiverId: string;
    firstWarehouseArrivalAt?: Date | string | null;
    /** to_warehouse bacaklarından en az biri kargoya verildi mi (shippedAt dolu). */
    handedToCargo?: boolean;
  },
  viewerUserId?: string | null,
): boolean {
  if (!viewerUserId) return false;
  const isParticipant =
    trade.initiatorId === viewerUserId || trade.receiverId === viewerUserId;
  if (!isParticipant) return false;
  const eligible: string[] = [
    TradeStatus.pending,
    TradeStatus.accepted,
    TradeStatus.awaiting_payment,
    TradeStatus.shipping_to_warehouse,
  ];
  if (!eligible.includes(trade.status as string)) return false;
  // Kullanıcı kuralı: ürün kargoya verildikten sonra iptal yok. Kargoya verme
  // (handedToCargo) ya da depoya varış (firstWarehouseArrivalAt) kilitler.
  if (
    trade.status === TradeStatus.shipping_to_warehouse &&
    (trade.handedToCargo || trade.firstWarehouseArrivalAt)
  ) {
    return false;
  }
  return true;
}
