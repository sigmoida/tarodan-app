"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { UseAdminResourceResult } from "@/hooks/useAdminResource";
import type { FilterField } from "@/components/list/filters/types";

// ── Row selection ────────────────────────────────────────────────────────────
export interface SelectionState {
  selectable: boolean;
  selectedIds: string[];
  toggleRow: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  clear: () => void;
}

/**
 * Row selection for the current view.
 *
 * `viewKey` identifies WHAT is on screen (page, page size, search, filters).
 * Selection is scoped to it: bulk bars can only inspect the rows they actually
 * hold, so a selection carried across a page change would be shown in the
 * "N selected" counter and then silently dropped by the action. Changing the
 * view clears it instead.
 */
export function useSelection(
  selectable = false,
  viewKey?: string,
): SelectionState {
  const [set, setSet] = useState<Set<string>>(new Set());
  const lastViewKey = useRef(viewKey);
  if (lastViewKey.current !== viewKey) {
    lastViewKey.current = viewKey;
    if (set.size > 0) setSet(new Set());
  }
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
  /** The list's filter schema — the toolbar builds its dialog from this. */
  filterFields: readonly FilterField[];
  /** The rendered table registers its columns here so the toolbar can offer a
   * CSV export without every page wiring one. */
  exportRef: MutableRefObject<any[]>;
  /** CSV, tabloya gerçekten basılan (map'lenmiş) satırları dışa aktarır —
   * ham API satırları değil (grup satırlı listelerde kolonlar map'li şekli bekler). */
  exportRowsRef: MutableRefObject<any[]>;
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
