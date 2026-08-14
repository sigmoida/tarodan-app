/** @format */

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";
import { useAnchoredPopover } from "../hooks/useAnchoredPopover";

/** `w-72` in px — kept in sync with the popover panel's width class below. */
const POPOVER_WIDTH = 288;

export interface DatePickerProps {
  /** ISO date string `yyyy-mm-dd` (the native `<input type="date">` value). */
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  helperText?: string;
  placeholder?: string;
  /** Inclusive bounds as `yyyy-mm-dd`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  inputSize?: "sm" | "md" | "lg";
  /** Locale for the header, weekday labels and the trigger's formatted value. */
  locale?: string;
  todayLabel?: string;
  clearLabel?: string;
  "aria-label"?: string;
}

const sizeClasses = {
  sm: "h-8 text-sm",
  md: "h-10 text-sm",
  lg: "h-12 text-base",
};
const sizePadX = { sm: "px-2.5", md: "px-3", lg: "px-4" };

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) =>
  `${y}-${pad(m + 1)}-${pad(d)}`;
function parseISO(s?: string): { y: number; m: number; d: number } | null {
  const match = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return match ? { y: +match[1], m: +match[2] - 1, d: +match[3] } : null;
}

/**
 * A design-system date picker: a bordered trigger (styled like `Input`) that
 * opens a themed calendar popover. Controlled via a `yyyy-mm-dd` string, so it
 * is a drop-in replacement for a native `<input type="date">`. Weekday/month
 * labels and the trigger's display value are locale-formatted via `Intl`.
 */
export function DatePicker({
  value,
  onChange,
  label,
  error,
  helperText,
  placeholder = "gg.aa.yyyy",
  min,
  max,
  disabled,
  id,
  className,
  inputSize = "md",
  locale = "tr-TR",
  todayLabel = "Bugün",
  clearLabel = "Temizle",
  ...aria
}: DatePickerProps) {
  const {
    open,
    toggle,
    close,
    triggerRef,
    popoverRef,
    pos: popoverPos,
  } = useAnchoredPopover<HTMLButtonElement>({
    offsetY: 8,
    width: POPOVER_WIDTH,
    viewportMargin: 16,
  });
  const selected = parseISO(value);

  const today = useMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }, []);
  // Without a value, open on the closest selectable month instead of today —
  // e.g. a birth-date field with `max` 18 years back would otherwise open on a
  // fully disabled month.
  const clampToBounds = (y: number, m: number) => {
    const mx = parseISO(max);
    const mn = parseISO(min);
    if (mx && (y > mx.y || (y === mx.y && m > mx.m)))
      return { y: mx.y, m: mx.m };
    if (mn && (y < mn.y || (y === mn.y && m < mn.m)))
      return { y: mn.y, m: mn.m };
    return { y, m };
  };
  const [view, setView] = useState(() =>
    selected
      ? { y: selected.y, m: selected.m }
      : clampToBounds(today.y, today.m),
  );

  // Follow the selected value when it changes from the outside.
  useEffect(() => {
    const p = parseISO(value);
    if (p) setView({ y: p.y, m: p.m });
  }, [value]);

  const isDisabledDay = (y: number, m: number, d: number) => {
    const iso = toISO(y, m, d);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-start
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const prevDays = new Date(view.y, view.m, 0).getDate();
    const arr: { y: number; m: number; d: number; outside: boolean }[] = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      arr.push({
        y: view.m === 0 ? view.y - 1 : view.y,
        m: view.m === 0 ? 11 : view.m - 1,
        d: prevDays - i,
        outside: true,
      });
    }
    for (let d = 1; d <= daysInMonth; d++)
      arr.push({ y: view.y, m: view.m, d, outside: false });
    let nd = 1;
    while (arr.length < 42) {
      arr.push({
        y: view.m === 11 ? view.y + 1 : view.y,
        m: view.m === 11 ? 0 : view.m + 1,
        d: nd++,
        outside: true,
      });
    }
    return arr;
  }, [view]);

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(locale, {
          weekday: "short",
        }),
      ),
    [locale],
  );
  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) =>
        new Date(2024, m, 1).toLocaleDateString(locale, { month: "long" }),
      ),
    [locale],
  );
  // Year dropdown range: bounded by min/max when given, otherwise a wide
  // window around today (newest first, so birth-date pickers read naturally).
  const yearOptions = useMemo(() => {
    const maxY = parseISO(max)?.y ?? today.y + 10;
    const minY = parseISO(min)?.y ?? Math.min(today.y, maxY) - 100;
    const years: number[] = [];
    for (let y = Math.max(maxY, minY); y >= minY; y--) years.push(y);
    return years;
  }, [min, max, today.y]);
  const displayValue = selected
    ? new Date(selected.y, selected.m, selected.d).toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

  const pick = (y: number, m: number, d: number) => {
    if (isDisabledDay(y, m, d)) return;
    onChange(toISO(y, m, d));
    close();
  };

  return (
    <div className={label ? "w-full" : undefined}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-sm font-medium text-heading"
        >
          {label}
        </label>
      )}
      <div>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={aria["aria-label"] ?? label}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border bg-surface-elevated text-left transition-colors",
            sizeClasses[inputSize],
            sizePadX[inputSize],
            "focus:outline-none focus:ring-1 focus:ring-offset-0",
            error
              ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500"
              : "border-border focus:border-primary-500 focus:ring-primary-500",
            "disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-50",
            className,
          )}
        >
          <span
            className={cn(
              "truncate",
              displayValue ? "text-body" : "text-subtle",
            )}
          >
            {displayValue || placeholder}
          </span>
          <CalendarDaysIcon
            className="h-4 w-4 shrink-0 text-subtle"
            aria-hidden
          />
        </button>

        {open &&
          popoverPos &&
          createPortal(
            <div
              ref={popoverRef}
              style={{ top: popoverPos.top, left: popoverPos.left }}
              className="fixed z-popover w-72 rounded-lg border border-border bg-surface-elevated p-3 shadow-lg"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <select
                    value={view.m}
                    onChange={(e) =>
                      setView((v) => ({ ...v, m: +e.target.value }))
                    }
                    aria-label="Month"
                    className="min-w-0 cursor-pointer rounded-md border border-border bg-surface-elevated py-1 pl-1.5 pr-1 text-sm font-semibold capitalize text-heading focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {monthNames.map((mLabel, m) => (
                      <option key={m} value={m}>
                        {mLabel}
                      </option>
                    ))}
                  </select>
                  <select
                    value={view.y}
                    onChange={(e) =>
                      setView((v) => ({ ...v, y: +e.target.value }))
                    }
                    aria-label="Year"
                    className="cursor-pointer rounded-md border border-border bg-surface-elevated py-1 pl-1.5 pr-1 text-sm font-semibold text-heading focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {(yearOptions.includes(view.y)
                      ? yearOptions
                      : [view.y, ...yearOptions]
                    ).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setView((v) =>
                        v.m === 0
                          ? { y: v.y - 1, m: 11 }
                          : { y: v.y, m: v.m - 1 },
                      )
                    }
                    aria-label="Previous month"
                    className="rounded-md p-1 text-muted hover:bg-surface-alt hover:text-heading"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setView((v) =>
                        v.m === 11
                          ? { y: v.y + 1, m: 0 }
                          : { y: v.y, m: v.m + 1 },
                      )
                    }
                    aria-label="Next month"
                    className="rounded-md p-1 text-muted hover:bg-surface-alt hover:text-heading"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {weekdayLabels.map((w, i) => (
                  <div
                    key={i}
                    className="py-1 text-center text-xs font-medium text-subtle"
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((c, i) => {
                  const isSel =
                    selected &&
                    c.y === selected.y &&
                    c.m === selected.m &&
                    c.d === selected.d;
                  const isToday =
                    c.y === today.y && c.m === today.m && c.d === today.d;
                  const dis = isDisabledDay(c.y, c.m, c.d);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={dis}
                      onClick={() => pick(c.y, c.m, c.d)}
                      className={cn(
                        "flex h-8 items-center justify-center rounded-md text-sm transition-colors",
                        dis
                          ? "cursor-not-allowed text-subtle opacity-40"
                          : "hover:bg-surface-alt",
                        c.outside ? "text-subtle" : "text-body",
                        !isSel &&
                          isToday &&
                          "font-semibold text-primary-600 ring-1 ring-inset ring-primary-300",
                        isSel &&
                          "!bg-primary-500 !text-inverted hover:!bg-primary-600",
                      )}
                    >
                      {c.d}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                  className="font-medium text-muted hover:text-heading"
                >
                  {clearLabel}
                </button>
                {!isDisabledDay(today.y, today.m, today.d) && (
                  <button
                    type="button"
                    onClick={() => {
                      setView({ y: today.y, m: today.m });
                      pick(today.y, today.m, today.d);
                    }}
                    className="font-medium text-primary-600 hover:text-primary-700"
                  >
                    {todayLabel}
                  </button>
                )}
              </div>
            </div>,
            document.body,
          )}
      </div>

      {error ? (
        <p className="mt-1 text-xs text-danger-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}
