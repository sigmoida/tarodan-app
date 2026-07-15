/** @format */

"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { Trade } from "../_lib/types";

/**
 * Live countdown string for whichever deadline is relevant to the trade's
 * current status (response / payment / shipping). Ticks every second and
 * clears itself when no deadline applies.
 */
export function useTradeCountdown(trade: Trade | null) {
  const t = useTranslations();
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!trade) return;

    // Determine which deadline to show based on status
    let deadline: string | undefined;
    let deadlineLabel: string = "";

    if (trade.status === "pending" && trade.responseDeadline) {
      deadline = trade.responseDeadline;
      deadlineLabel = t("seller.responseTime");
    } else if (
      (trade.status === "accepted" || trade.status === "awaiting_payment") &&
      trade.paymentDeadline
    ) {
      deadline = trade.paymentDeadline;
      deadlineLabel = t("trade.paymentTime");
    } else if (
      [
        "initiator_shipped",
        "receiver_shipped",
        "accepted",
        "shipping_to_warehouse",
      ].includes(trade.status) &&
      trade.shippingDeadline
    ) {
      deadline = trade.shippingDeadline;
      deadlineLabel = t("trade.shippingTime");
    }

    if (!deadline) {
      setCountdown(null);
      return;
    }

    const calculateCountdown = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline!).getTime();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        setCountdown(`${deadlineLabel}: ${t("trade.timeExpired")}`);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = "";
      if (days > 0) timeStr += `${days}${t("trade.dayShort")} `;
      timeStr += `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

      setCountdown(`${deadlineLabel}: ${timeStr}`);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade]);

  return countdown;
}
