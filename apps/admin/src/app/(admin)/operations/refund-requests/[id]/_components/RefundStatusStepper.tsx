"use client";

import { Stepper, type StepperStep } from "@tarodan/ui";
import {
  REFUND_LIFECYCLE,
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
  let steps: StepperStep[];
  let current: number;

  if (refundTerminalStatuses.has(status)) {
    const endLabel = status === "rejected" ? "Reddedildi" : "İptal edildi";
    steps = [{ label: "Talep alındı" }, { label: endLabel, error: true }];
    current = 1;
  } else {
    steps = REFUND_LIFECYCLE.map((label) => ({ label }));
    current = refundStatusPhase[status] ?? 0;
  }

  return (
    <div className="bg-surface-elevated rounded-xl shadow-sm p-4 sm:p-6">
      <Stepper steps={steps} current={current} />
    </div>
  );
}
