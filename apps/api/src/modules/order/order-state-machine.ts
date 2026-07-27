import { OrderStatus } from "@prisma/client";

export type OrderTransitionActor = "buyer" | "seller" | "system";

export interface OrderTransitionRule {
  to: OrderStatus;
  allowedBy: OrderTransitionActor;
}

/**
 * Canonical order state graph — the SINGLE SOURCE OF TRUTH for which status
 * transitions are structurally valid and which actor may trigger them.
 *
 * - The user-facing path (OrderLifecycleService.updateStatus) enforces the
 *   `allowedBy` actor on top of this graph.
 * - The admin path enforces the STRUCTURAL graph plus an explicit override set
 *   (isAdminOrderTransitionAllowed) — admin is privileged but still cannot make
 *   impossible jumps (e.g. pending_payment → completed) or leave a terminal state.
 *
 * Add every new transition HERE; never inline a second copy of this table.
 */
export const ORDER_TRANSITION_RULES: Record<
  OrderStatus,
  OrderTransitionRule[]
> = {
  [OrderStatus.pending_payment]: [
    { to: OrderStatus.paid, allowedBy: "system" },
    { to: OrderStatus.preparing, allowedBy: "system" },
    { to: OrderStatus.cancelled, allowedBy: "buyer" },
  ],
  [OrderStatus.paid]: [
    { to: OrderStatus.preparing, allowedBy: "seller" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
    { to: OrderStatus.refunded, allowedBy: "system" },
  ],
  [OrderStatus.preparing]: [{ to: OrderStatus.shipped, allowedBy: "system" }],
  [OrderStatus.shipped]: [{ to: OrderStatus.delivered, allowedBy: "system" }],
  [OrderStatus.delivered]: [{ to: OrderStatus.completed, allowedBy: "buyer" }],
  [OrderStatus.awaiting_buyer_confirmation]: [
    { to: OrderStatus.completed, allowedBy: "buyer" },
    { to: OrderStatus.completed, allowedBy: "system" },
    { to: OrderStatus.refund_requested, allowedBy: "buyer" },
  ],
  [OrderStatus.completed]: [],
  [OrderStatus.cancelled]: [],
  [OrderStatus.refund_requested]: [
    { to: OrderStatus.refunded, allowedBy: "system" },
  ],
  [OrderStatus.refunded]: [],
};

/** Terminal states: no outgoing transition is ever allowed. */
export const ORDER_TERMINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.completed,
  OrderStatus.cancelled,
  OrderStatus.refunded,
];

/** Structural check: is there ANY rule allowing `from` → `to` (actor ignored)? */
export function isOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  return (ORDER_TRANSITION_RULES[from] ?? []).some((r) => r.to === to);
}

/**
 * Admin transition policy. Admin is privileged (can cancel/refund/force-progress
 * an active order for support) but still constrained so the generic admin status
 * setter cannot make nonsensical jumps:
 *   - terminal states (completed/cancelled/refunded) are frozen,
 *   - `paid`/`pending_payment` are payment-system-driven and never set by hand,
 *   - an unpaid order (pending_payment) may only be cancelled — never fast-forwarded
 *     to delivered/completed/refunded (nothing was paid to refund).
 * Everything else on an already-paid, non-terminal order is permitted.
 */
export function isAdminOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  if (ORDER_TERMINAL_STATUSES.includes(from)) return false;
  if (to === OrderStatus.pending_payment || to === OrderStatus.paid) {
    return false;
  }
  if (from === OrderStatus.pending_payment) {
    return to === OrderStatus.cancelled;
  }
  return true;
}
