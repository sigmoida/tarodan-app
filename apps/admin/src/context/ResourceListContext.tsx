"use client";

import {
  createContext,
  useContext,
  useState,
  type MutableRefObject,
} from "react";
import type { UseAdminResourceResult } from "@/hooks/useAdminResource";

// ── Row selection ────────────────────────────────────────────────────────────
export interface SelectionState {
  selectable: boolean;
  selectedIds: string[];
  toggleRow: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  clear: () => void;
}

export function useSelection(selectable = false): SelectionState {
  const [set, setSet] = useState<Set<string>>(new Set());
  return {
    selectable,
    selectedIds: Array.from(set),
    toggleRow: (id) =>
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: (ids) =>
      setSet((prev) =>
        ids.every((id) => prev.has(id)) ? new Set() : new Set(ids),
      ),
    clear: () => setSet(new Set()),
  };
}

// ── Context ──────────────────────────────────────────────────────────────────
export interface ResourceListContextValue<T> extends UseAdminResourceResult<T> {
  getRowId: (row: T) => string;
  selection: SelectionState;
  /** The rendered table registers its columns here so the toolbar can offer a
   * CSV export without every page wiring one. */
  exportRef: MutableRefObject<any[]>;
  /** Resource name — used as the CSV filename stem. */
  exportName: string;
}

export const ResourceListContext =
  createContext<ResourceListContextValue<any> | null>(null);

/** Read the list's runtime state (rows, search, filters, page, selection…). */
export function useResourceList<T = any>(): ResourceListContextValue<T> {
  const ctx = useContext(ResourceListContext);
  if (!ctx)
    throw new Error("useResourceList must be used within <ResourceList>");
  return ctx;
}

/** `[value, setValue]` bound to a single filter — for building custom filter controls. */
export function useFilter(name: string): [string, (value: string) => void] {
  const { filters, setFilter } = useResourceList();
  return [filters[name] ?? "", (value) => setFilter(name, value)];
}
