"use client";

import { useTabParam } from "@/hooks/useTabParam";
import {
  CANCELLATION_REFUND_VIEW_PARAM,
  DEFAULT_CANCELLATION_REFUND_VIEW,
  VIEW_SCOPED_PARAMS,
  resolveCancellationRefundView,
  type CancellationRefundView,
} from "../_lib/view";

// Module-level so `setView` keeps its identity across renders.
const VIEW_OPTIONS = {
  param: CANCELLATION_REFUND_VIEW_PARAM,
  clearOnChange: VIEW_SCOPED_PARAMS,
} as const;

/**
 * Üst sekme (İptaller | İadeler) — `?view=`. Sekme değişince bir sekmenin
 * filtreleri, alt sekmeleri ve sayfası diğerine taşınmaz.
 */
export function useCancellationRefundView(): {
  view: CancellationRefundView;
  setView: (key: string) => void;
} {
  const [raw, setView] = useTabParam(
    DEFAULT_CANCELLATION_REFUND_VIEW,
    VIEW_OPTIONS,
  );
  return { view: resolveCancellationRefundView(raw), setView };
}
