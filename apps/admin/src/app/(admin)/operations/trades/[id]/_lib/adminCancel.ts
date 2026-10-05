import {
  ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS,
  adminTradeCancelBlocker,
  type AdminTradeCancelBlocker,
} from "@tarodan/types";
import type { TradeDetail } from "../types";

/**
 * "Takası iptal et" (platform iptali) uygunluğu — kural `@tarodan/types`'taki
 * `adminTradeCancelBlocker`'dır; API önizlemeyi ve iptali aynı kuralla kabul /
 * reddeder (satır kilidi altında yeniden). Burada yalnız takas dosyasının veri
 * şekli kuralın girdisine çevrilir.
 */
export function tradeCancelBlocker(
  trade: TradeDetail,
): AdminTradeCancelBlocker | null {
  return adminTradeCancelBlocker({
    status: trade.status,
    firstWarehouseArrivalAt: trade.firstWarehouseArrivalAt,
    cancelLockedAt: trade.cancelLockedAt,
    shipments: (trade.shipments ?? []).map((shipment) => ({
      leg: shipment.leg,
      status: shipment.status ?? "",
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
    })),
  });
}

/**
 * Panelin göstereceği durum: uygun → düğme; engelli (ama kapanmamış) → engelin
 * metni; kapanmış takas → hiçbir şey (yapılacak bir şey yok).
 */
export type TradeCancelPanelState =
  | { kind: "allowed" }
  | {
      kind: "blocked";
      messageKey: (typeof ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS)[AdminTradeCancelBlocker];
    }
  | { kind: "hidden" };

export function tradeCancelPanelState(
  trade: TradeDetail,
): TradeCancelPanelState {
  const blocker = tradeCancelBlocker(trade);
  if (blocker === null) return { kind: "allowed" };
  if (blocker === "closed") return { kind: "hidden" };
  return {
    kind: "blocked",
    messageKey: ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS[blocker],
  };
}
