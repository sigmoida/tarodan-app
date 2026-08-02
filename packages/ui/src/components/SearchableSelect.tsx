/** @format */

"use client";

import React from "react";
import { cn } from "../lib/utils";
import { matchesSearch } from "../lib/search";
import { Input } from "./Input";
import { selectTriggerClasses } from "./Select";

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  /** Selected option value ("" when nothing is selected). */
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** Trigger text shown when nothing is selected. */
  placeholder?: string;
  /** Placeholder for the filter box inside the open menu. */
  searchPlaceholder?: string;
  /** Shown when the filter matches no options. */
  emptyText?: string;
  disabled?: boolean;
  error?: string;
  /** Label rendered above (matches the shared `Select`/`Input`). */
  label?: string;
  /** Helper text below (hidden when `error` is present). */
  helperText?: string;
  selectSize?: "sm" | "md" | "lg";
  required?: boolean;
  id?: string;
  name?: string;
  /** Class applied to the trigger (as with `Select`). */
  className?: string;
  "aria-label"?: string;
}

/** Shared with SearchableMultiSelect — keep the two dropdowns visually identical. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={cn(
        "h-4 w-4 flex-shrink-0 text-subtle transition-transform",
        open && "rotate-180",
      )}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
    </svg>
  );
}

/** Shared with SearchableMultiSelect. */
export function CheckMark() {
  return (
    <svg
      className="h-4 w-4 flex-shrink-0 text-primary-600"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m5 10 3.5 3.5L15 7"
      />
    </svg>
  );
}

/**
 * Select with a built-in search box — the single shared searchable dropdown.
 * Its trigger reuses `selectTriggerClasses`, so it is visually identical to the
 * design-system `Select`; the open menu adds a filter `Input` (Turkish-correct,
 * accent-insensitive matching via `matchesSearch`) over a scrollable list with
 * keyboard navigation. For react-hook-form use `FormSearchableSelect`.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText = "Sonuç bulunamadı",
  disabled,
  error,
  label,
  helperText,
  selectSize = "md",
  required,
  id,
  name,
  className,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [openUp, setOpenUp] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const reactId = React.useId();
  const selectId =
    id || (label ? label.toLowerCase().replace(/\s+/g, "-") : reactId);

  const selected = options.find((o) => o.value === value);
  const filtered = React.useMemo(
    () => options.filter((o) => matchesSearch(o.label, query)),
    [options, query],
  );

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Close on outside click while open.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  // On open: clear the query, focus the search box, highlight the selection.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
    // Intentionally runs only when the menu opens, not on every options/value
    // change, so typing a filter isn't reset by an unrelated re-render.
  }, [open]);

  // Keep the highlight within the (filtered) list and scrolled into view.
  React.useEffect(() => {
    setHighlight((h) =>
      Math.min(Math.max(h, 0), Math.max(0, filtered.length - 1)),
    );
  }, [filtered.length]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const openMenu = () => {
    if (disabled) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect && typeof window !== "undefined") {
      setOpenUp(window.innerHeight - rect.bottom < 300);
    }
    setOpen(true);
  };

  const choose = (opt: SearchableSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const combo = (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        id={selectId}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        className={cn(
          selectTriggerClasses(error, selectSize),
          !selected && "text-subtle",
          className,
        )}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-popover w-full overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg",
            openUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <div className="border-b border-border-subtle p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              inputSize="sm"
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-56 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-center text-sm text-muted">
                {emptyText}
              </li>
            ) : (
              filtered.map((opt, i) => {
                const active = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(opt);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm",
                      opt.disabled && "pointer-events-none opacity-50",
                      i === highlight && "bg-surface-alt",
                      active ? "font-medium text-primary-600" : "text-body",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {active && <CheckMark />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );

  if (!label && !error && !helperText) return combo;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1.5 block text-sm font-medium text-body"
        >
          {label}
        </label>
      )}
      {combo}
      {(error || helperText) && (
        <p
          className={cn(
            "mt-1 text-sm",
            error ? "text-danger-600" : "text-muted",
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
}

SearchableSelect.displayName = "SearchableSelect";
