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
    // Kargo öncesi alıcı iptali (İPTAL tipi) — cancel() komutu üzerinden; tam
    // PSP iadesiyle birlikte processRefund siparişi cancelled yazar.
    { to: OrderStatus.cancelled, allowedBy: "buyer" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.preparing]: [
    { to: OrderStatus.shipped, allowedBy: "system" },
    // Alıcı kargo öncesi iptali + "satıcı kargolamadı" zaman aşımı (cron).
    { to: OrderStatus.cancelled, allowedBy: "buyer" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.shipped]: [
    { to: OrderStatus.delivered, allowedBy: "system" },
    // Dönüş kargosu açıldığında sipariş iade akışına işaretlenir (Sürat sync).
    { to: OrderStatus.refund_requested, allowedBy: "system" },
  ],
  [OrderStatus.delivered]: [
    { to: OrderStatus.completed, allowedBy: "buyer" },
    { to: OrderStatus.refund_requested, allowedBy: "system" },
    // Tam tutarlı iade finalize olduğunda tek yazıcı processRefund'dur ve
    // siparişi cancelled kapatır (kısmi adet iadesinde sipariş açık kalır).
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.awaiting_buyer_confirmation]: [
    { to: OrderStatus.completed, allowedBy: "buyer" },
    { to: OrderStatus.completed, allowedBy: "system" },
    { to: OrderStatus.refund_requested, allowedBy: "buyer" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  // Erken onaylanmış sipariş, teslimat + 14 günlük cayma penceresi içinde
  // hâlâ iadeye açılabilir; bu çıkışlar YALNIZ sistem iade akışının çıktısıdır
  // (kullanıcı genel statü ucundan tetikleyemez).
  [OrderStatus.completed]: [
    { to: OrderStatus.refund_requested, allowedBy: "system" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.cancelled]: [],
  [OrderStatus.refund_requested]: [
    { to: OrderStatus.refunded, allowedBy: "system" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.refunded]: [],
};

/**
 * Kullanıcı akışları için terminal statüler. `completed` kullanıcı statü
 * geçişleri için terminaldir; cayma penceresi içindeki SİSTEM iade akışı
 * (yukarıdaki system kenarları) bunun bilinçli istisnasıdır.
 */
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
 * The generic admin setter is deliberately narrow. Money-changing transitions
 * (cancel/refund/complete) have dedicated commands that run their stock, PSP,
 * ledger and invoice side effects. Shipping requires a tracking command.
 */
export function isAdminOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === OrderStatus.paid && to === OrderStatus.preparing) ||
    (from === OrderStatus.shipped && to === OrderStatus.delivered)
  );
}
