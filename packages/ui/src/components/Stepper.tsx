/** @format */

"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Shared horizontal stepper for multi-step flows (checkout wizard, refund status
 * lifecycle, …). Completed steps get ✓, the current one is highlighted, upcoming
 * ones are dimmed, and a step flagged `error` shows a red ✕ (terminal states).
 *
 * Steps become clickable buttons when `onStepClick` is provided — by default only
 * steps up to `current` (i.e. going back); pass `canClickStep` to change that. Pair
 * with the `useStepper` hook to bind next/back to your Continue/Back buttons.
 */

export interface StepperStep {
  label: string;
  /** Override the circle content (number/check/✕ by default). */
  icon?: React.ReactNode;
  /** Terminal error step — renders a red ✕ (e.g. rejected/cancelled). */
  error?: boolean;
}

export interface StepperProps {
  steps: Array<StepperStep | string>;
  /** Active step index (0-based). */
  current: number;
  /** When set, steps render as buttons and call this with the clicked index. */
  onStepClick?: (index: number) => void;
  /** Gate which steps are clickable. Default: any step ≤ `current` (go back). */
  canClickStep?: (index: number) => boolean;
  className?: string;
}

type StepTone = "done" | "active" | "upcoming" | "error";

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
    <path
      fillRule="evenodd"
      d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.3 6.8-6.8a1 1 0 011.4 0z"
      clipRule="evenodd"
    />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
    <path
      fillRule="evenodd"
      d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z"
      clipRule="evenodd"
    />
  </svg>
);

/** A connector half — flanks a circle. `'hidden'` for the outer edge of the
 * first/last step (keeps the circle centred in its column without a stray line). */
type HalfTone = "hidden" | "done" | "todo";
function Half({ side }: { side: HalfTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-0.5 flex-1",
        side === "hidden" && "invisible",
        side === "done" && "bg-primary-600",
        side === "todo" && "bg-border",
      )}
    />
  );
}

function StepMark({
  label,
  tone,
  icon,
  left,
  right,
  onClick,
}: {
  label: string;
  tone: StepTone;
  icon: React.ReactNode;
  left: HalfTone;
  right: HalfTone;
  onClick?: () => void;
}) {
  const body = (
    <>
      {/* circle row: connectors sit in the same flex row so `items-center`
			    aligns them to the circle's vertical middle automatically. */}
      <span className="flex w-full items-center">
        <Half side={left} />
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            tone === "done" && "bg-primary-600 text-inverted",
            tone === "active" &&
              "bg-primary-100 text-primary-700 ring-2 ring-primary-500",
            tone === "upcoming" && "bg-surface-alt text-muted",
            tone === "error" &&
              "bg-danger-100 text-danger-700 ring-2 ring-danger-400",
          )}
        >
          {icon}
        </span>
        <Half side={right} />
      </span>
      <span
        className={cn(
          "mt-1.5 px-1 text-xs font-medium leading-tight",
          tone === "active" && "text-heading",
          tone === "error" && "text-danger-700",
          (tone === "done" || tone === "upcoming") && "text-muted",
        )}
      >
        {label}
      </span>
    </>
  );

  // Each step is an equal-width flex column, so N steps always fill the row —
  // no fixed widths, no horizontal scroll; labels wrap as columns narrow.
  const base = "flex min-w-0 flex-1 flex-col items-center text-center";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          base,
          "cursor-pointer rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary-400",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

export function Stepper({
  steps,
  current,
  onStepClick,
  canClickStep,
  className,
}: StepperProps) {
  const items = steps.map((s) => (typeof s === "string" ? { label: s } : s));

  return (
    <ol className={cn("flex w-full items-start", className)}>
      {items.map((step, i) => {
        const isLast = i === items.length - 1;
        const done = i < current;
        const active = i === current;
        const tone: StepTone = step.error
          ? "error"
          : done
            ? "done"
            : active
              ? "active"
              : "upcoming";
        const clickable =
          !!onStepClick && (canClickStep ? canClickStep(i) : i <= current);
        const icon =
          step.icon ??
          (tone === "error" ? (
            <XIcon />
          ) : tone === "done" ? (
            <CheckIcon />
          ) : (
            i + 1
          ));
        // A segment between step k and k+1 is "done" once we've passed k
        // (k < current). Each circle's left half belongs to the segment
        // before it, its right half to the segment after it.
        const left: HalfTone =
          i === 0 ? "hidden" : i - 1 < current ? "done" : "todo";
        const right: HalfTone = isLast
          ? "hidden"
          : i < current
            ? "done"
            : "todo";
        return (
          <li key={`${step.label}-${i}`} className="flex min-w-0 flex-1">
            <StepMark
              label={step.label}
              tone={tone}
              icon={icon}
              left={left}
              right={right}
              onClick={clickable ? () => onStepClick!(i) : undefined}
            />
          </li>
        );
      })}
    </ol>
  );
}

Stepper.displayName = "Stepper";

/**
 * Step-index state with next/back/goTo helpers — bind directly to Continue/Back
 * buttons. Indices are clamped to `[0, stepCount - 1]`.
 */
export function useStepper(stepCount: number, initial = 0) {
  const [current, setCurrent] = React.useState(initial);
  const goTo = React.useCallback(
    (i: number) => setCurrent(Math.min(stepCount - 1, Math.max(0, i))),
    [stepCount],
  );
  const next = React.useCallback(
    () => setCurrent((c) => Math.min(stepCount - 1, c + 1)),
    [stepCount],
  );
  const back = React.useCallback(
    () => setCurrent((c) => Math.max(0, c - 1)),
    [],
  );
  return {
    current,
    goTo,
    next,
    back,
    isFirst: current === 0,
    isLast: current === stepCount - 1,
  };
}
