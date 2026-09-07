/** @format */

import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  ChartPieIcon,
  CreditCardIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import type { MetricTone } from "@/components/MetricCard";
import type { ReconciliationSectionKey } from "./types";

/** Bölüm → ikon/ton. Satır bağlantıları (href) API'den gelir; burada yalnız görsel. */
export const SECTION_PRESENTATION: Record<
  ReconciliationSectionKey,
  { icon: ComponentType<{ className?: string }>; tone: MetricTone }
> = {
  revenueSplit: { icon: CreditCardIcon, tone: "info" },
  sellerShare: { icon: LockClosedIcon, tone: "warning" },
  tradeCounterpart: { icon: ArrowsRightLeftIcon, tone: "primary" },
  platformNet: { icon: ChartPieIcon, tone: "primary" },
  buyerRefunds: { icon: BanknotesIcon, tone: "danger" },
};
