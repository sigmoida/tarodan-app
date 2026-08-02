/** @format */

"use client";

import React from "react";
import { cn } from "../lib/utils";
import { matchesSearch } from "../lib/search";
import { Input } from "./Input";
import { Label } from "./Label";
import { selectTriggerClasses } from "./Select";
import {
  Chevron,
  CheckMark,
  type SearchableSelectOption,
} from "./SearchableSelect";

export interface SearchableMultiSelectProps {
  /** Selected options — objects (not bare values) so chips keep their labels
   *  even when the current search results no longer include them. */
  value: SearchableSelectOption[];
  onChange: (value: SearchableSelectOption[]) => void;
  /** Options shown in the open menu. In async mode (see `onQueryChange`) pass
   *  the server's results; otherwise the full list (filtered locally). */
  options: SearchableSelectOption[];
  /** Controlled search for ASYNC lookups: the parent receives the query,
   *  fetches, and re-renders `options`. When omitted the component filters
   *  `options` locally (Turkish-correct matching). */
  onQueryChange?: (query: string) => void;
  /** Async fetch in flight — shows `loadingText` instead of `emptyText`. */
  loading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  helperText?: string;
  selectSize?: "sm" | "md" | "lg";
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Multi-select twin of `SearchableSelect`: same trigger/menu styling, but the
 * trigger renders removable chips for each selection and choosing an option
 * toggles it without closing the menu. Supports async lookups via
 * `onQueryChange` + `loading`. For react-hook-form use
 * `FormSearchableMultiSelect`.
 */
export function SearchableMultiSelect({
  value,
  onChange,
  options,
  onQueryChange,
  loading,
  placeholder,
  searchPlaceholder,
  emptyText = "Sonuç bulunamadı",
  loadingText = "Aranıyor…",
  disabled,
  error,
  label,
  helperText,
  selectSize = "md",
  id,
  className,
  "aria-label": ariaLabel,
}: SearchableMultiSelectProps) {
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

  const isAsync = !!onQueryChange;
  const filtered = React.useMemo(
    () =>
      isAsync ? options : options.filter((o) => matchesSearch(o.label, query)),
    [options, query, isAsync],
  );
  const selectedValues = React.useMemo(
    () => new Set(value.map((o) => o.value)),
    [value],
  );

  const setSearch = (q: string) => {
    setQuery(q);
    onQueryChange?.(q);
  };

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    onQueryChange?.("");
  }, [onQueryChange]);

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

  React.useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

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

  /** Toggle without closing — multi-select keeps the menu open for more picks. */
  const toggle = (opt: SearchableSelectOption) => {
    if (opt.disabled) return;
    onChange(
      selectedValues.has(opt.value)
        ? value.filter((o) => o.value !== opt.value)
        : [...value, opt],
    );
  };

  const remove = (val: string) => {
    onChange(value.filter((o) => o.value !== val));
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
      if (opt) toggle(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      remove(value[value.length - 1].value);
    }
  };

  const combo = (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        id={selectId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        className={cn(
          selectTriggerClasses(error, selectSize),
          "h-auto min-h-10 flex-wrap gap-1.5 py-1.5",
          value.length === 0 && "text-subtle",
          className,
        )}
      >
        {value.length === 0 ? (
          <span className="truncate">{placeholder}</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {value.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700"
              >
                <span className="truncate">{opt.label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`${opt.label} kaldır`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(opt.value);
                  }}
                  className="text-primary-400 transition-colors hover:text-primary-700"
                >
                  ×
                </span>
              </span>
            ))}
          </span>
        )}
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
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              inputSize="sm"
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            aria-multiselectable
            className="max-h-56 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-center text-sm text-muted">
                {loading ? loadingText : emptyText}
              </li>
            ) : (
              filtered.map((opt, i) => {
                const active = selectedValues.has(opt.value);
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggle(opt);
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
        <Label htmlFor={selectId} className="mb-1.5 block">
          {label}
        </Label>
      )}
      {combo}
      {error ? (
        <p className="mt-1.5 text-sm text-danger-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1.5 text-sm text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}
