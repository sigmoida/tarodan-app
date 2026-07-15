"use client";

import { useTranslations } from "next-intl";
import { Stepper, type StepperStep } from "@tarodan/ui";
import {
  refundLifecycle,
  refundStatusPhase,
  refundTerminalStatuses,
} from "../_lib/refund-guidance";

/**
 * Horizontal stepper showing at a glance which phase the refund process is in.
 * Built on the shared `@tarodan/ui` Stepper (the same component the checkout
 * wizard uses); status-driven and non-interactive. Completed phases get ✓, the
 * current one is highlighted, and rejected/cancelled render a red ✕ end-cap.
 */
export function RefundStatusStepper({ status }: { status: string }) {
  const t = useTranslations();
  let steps: StepperStep[];
  let current: number;

  if (refundTerminalStatuses.has(status)) {
    const endLabel =
      status === "rejected"
        ? t("common.rejected")
        : t("admin.operations.common.cancelled");
    steps = [
      { label: t("admin.operations.refundRequests.lifecycle.received") },
      { label: endLabel, error: true },
    ];
    current = 1;
  } else {
    steps = refundLifecycle(t).map((label) => ({ label }));
    current = refundStatusPhase[status] ?? 0;
  }

  return (
    <div className="bg-surface-elevated rounded-xl shadow-sm p-4 sm:p-6">
      <Stepper steps={steps} current={current} />
    </div>
  );
}
