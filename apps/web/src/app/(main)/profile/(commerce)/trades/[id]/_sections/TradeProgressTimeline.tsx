/** @format */

"use client";

import { Stepper, type StepperStep } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { Trade } from "../_lib/types";

const ACTIVE_STATUSES = [
  "accepted",
  "awaiting_payment",
  "shipping_to_warehouse",
  "at_warehouse",
  "admin_reviewing",
  "shipping_to_recipients",
  "completed",
  "returning",
];

/**
 * Visual progress for the active safe-trade (escrow) flow — built on the shared
 * `@tarodan/ui` Stepper (same component the checkout wizard and refund status
 * use). The `returning` state swaps the stepper for a warning note.
 */
export default function TradeProgressTimeline({ trade }: { trade: Trade }) {
  const t = useTranslations();
  if (!ACTIVE_STATUSES.includes(trade.status)) return null;

  const hasCash = !!trade.cashAmount;
  const isReturning = trade.status === "returning";

  const steps: StepperStep[] = [
    { label: t("trade.statusAccepted") },
    ...(hasCash ? [{ label: t("checkout.step2") }] : []),
    { label: t("trade.stepShipToWarehouse") },
    { label: t("trade.tradeStatus.at_warehouse") },
    { label: t("trade.stepShippingToYou") },
    { label: t("trade.statusCompleted") },
  ];
  const order: Record<string, number> = {
    accepted: 0,
    awaiting_payment: 1,
    shipping_to_warehouse: hasCash ? 2 : 1,
    at_warehouse: hasCash ? 3 : 2,
    admin_reviewing: hasCash ? 3 : 2,
    shipping_to_recipients: hasCash ? 4 : 3,
    completed: hasCash ? 5 : 4,
  };
  const current = order[trade.status] ?? 0;

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface-elevated p-4 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-heading">
        {t("trade.tradeProgress")}
      </h3>
      {isReturning ? (
        <p className="rounded border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700">
          {t("trade.progressReturning")}
        </p>
      ) : (
        <Stepper steps={steps} current={current} />
      )}
    </div>
  );
}
