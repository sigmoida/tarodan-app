import type { AdminRefundRow } from "@tarodan/types";

/** Takas iadesinin iki satırı (başlatan / devam ettiren) aynı çizgiyle işaretlenir. */
const TRADE_GROUP_ROW_CLASS =
  "shadow-[inset_3px_0_0_0_theme(colors.primary.300)]";

/**
 * Takas iadeleri API'den iki satır (başlatan + devam ettiren) gelir ve
 * bitişik durur; ince bir sol çizgi ikisini tek takas olarak gösterir.
 */
export function refundRowClassName(row: AdminRefundRow): string | undefined {
  return row.trade ? TRADE_GROUP_ROW_CLASS : undefined;
}

export const TRADE_ROLE_I18N_KEYS = {
  initiator: "admin.operations.refunds.cells.role.initiator",
  responder: "admin.operations.refunds.cells.role.responder",
} as const satisfies Record<
  NonNullable<AdminRefundRow["trade"]>["role"],
  string
>;

/** Sipariş hücresinin ikinci satırı: takasta takas no, değilse varsa grup no. */
export function refundGroupRef(
  row: AdminRefundRow,
): { kind: "trade"; tradeId: string; number: string } | { kind: "group"; number: string } | null {
  if (row.trade) {
    return {
      kind: "trade",
      tradeId: row.trade.tradeId,
      number: row.trade.tradeNumber,
    };
  }
  return row.order.groupNumber
    ? { kind: "group", number: row.order.groupNumber }
    : null;
}

/** Notun hücrede gösterilen kısaltması (tamamı `title`'da). */
export const REFUND_NOTE_MAX_LENGTH = 80;

export function truncateNote(note: string | null | undefined): string | null {
  const text = note?.trim();
  if (!text) return null;
  return text.length > REFUND_NOTE_MAX_LENGTH
    ? `${text.slice(0, REFUND_NOTE_MAX_LENGTH - 1).trimEnd()}…`
    : text;
}
