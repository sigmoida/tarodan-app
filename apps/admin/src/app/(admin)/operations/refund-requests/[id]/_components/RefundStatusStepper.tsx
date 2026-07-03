"use client";

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { cn } from "@tarodan/ui";
import {
  REFUND_LIFECYCLE,
  refundStatusPhase,
  refundTerminalStatuses,
} from "../_lib/refund-guidance";

/**
 * İade sürecinin hangi aşamada olduğunu tek bakışta gösteren yatay çizelge.
 * Tamamlanan aşamalar ✓, mevcut aşama vurgulu, gelecek aşamalar soluk.
 * rejected/cancelled durumlarında kırmızı uç-kapağı gösterir.
 */
export function RefundStatusStepper({ status }: { status: string }) {
  if (refundTerminalStatuses.has(status)) {
    const endLabel = status === "rejected" ? "Reddedildi" : "İptal edildi";
    const steps = ["Talep alındı", endLabel];
    return (
      <Shell>
        {steps.map((label, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li
              key={label}
              className={cn("flex items-start", !isLast && "flex-1")}
            >
              <Step
                label={label}
                tone={isLast ? "rejected" : "done"}
                icon={
                  isLast ? (
                    <XMarkIcon className="h-4 w-4" />
                  ) : (
                    <CheckIcon className="h-4 w-4" />
                  )
                }
              />
              {!isLast && <Connector done />}
            </li>
          );
        })}
      </Shell>
    );
  }

  const current = refundStatusPhase[status] ?? 0;

  return (
    <Shell>
      {REFUND_LIFECYCLE.map((label, i) => {
        const isLast = i === REFUND_LIFECYCLE.length - 1;
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className={cn("flex items-start", !isLast && "flex-1")}
          >
            <Step
              label={label}
              tone={done ? "done" : active ? "active" : "upcoming"}
              icon={done ? <CheckIcon className="h-4 w-4" /> : i + 1}
            />
            {!isLast && <Connector done={done} />}
          </li>
        );
      })}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-elevated rounded-xl shadow-sm p-4 sm:p-6 overflow-x-auto">
      <ol className="flex items-start min-w-[600px]">{children}</ol>
    </div>
  );
}

type StepTone = "done" | "active" | "upcoming" | "rejected";

function Step({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: StepTone;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex w-24 flex-col items-center gap-1.5 text-center">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
          tone === "done" && "bg-primary-600 text-inverted",
          tone === "active" &&
            "bg-primary-100 text-primary-700 ring-2 ring-primary-500",
          tone === "upcoming" && "bg-surface-alt text-muted",
          tone === "rejected" &&
            "bg-danger-100 text-danger-700 ring-2 ring-danger-400",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-xs font-medium leading-tight",
          tone === "active" && "text-heading",
          tone === "rejected" && "text-danger-700",
          (tone === "done" || tone === "upcoming") && "text-muted",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function Connector({ done }: { done: boolean }) {
  return (
    <div
      className={cn(
        "mt-4 h-0.5 flex-1",
        done ? "bg-primary-600" : "bg-border",
      )}
    />
  );
}
