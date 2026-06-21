"use client";

import { Fragment, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { Spinner } from "@tarodan/ui";

export type { ColumnDef };

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  /** Veri boşken gösterilecek metin. */
  emptyText?: string;
  /** Veri boşken metnin altında gösterilecek aksiyon (örn. "İlk kaydı ekle" butonu). */
  emptyAction?: ReactNode;
  /** Satıra tıklanınca (örn. detaya git). */
  onRowClick?: (row: T) => void;
  /** Satıra ek className (örn. seçili/itirazlı satır vurgusu). */
  rowClassName?: (row: T) => string | undefined;
  /** Satır kimliği — seçim için gerekli. */
  getRowId?: (row: T) => string;
  // ── Çoklu seçim (opsiyonel) ──
  selectable?: boolean;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  // ── Genişletilebilir satır (opsiyonel) ──
  /** Açık satırın altına tam genişlikte render edilecek panel (örn. marka modelleri). */
  renderExpanded?: (row: T) => ReactNode;
  /** O an açık olan satırın kimliği (getRowId ile eşleşir). Verilince yumuşak açılır/kapanır. */
  expandedId?: string | null;
}

/**
 * Admin liste sayfalarının TEK ortak tablosu. @tanstack/react-table motoru +
 * mevcut `admin-table` görünümü. Sütunlar ColumnDef ile tanımlanır; loading/empty,
 * satır-tık ve opsiyonel çoklu-seçim dahili yönetilir.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  emptyText = "Kayıt bulunamadı",
  emptyAction,
  onRowClick,
  rowClassName,
  getRowId,
  selectable,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  renderExpanded,
  expandedId,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  const rowIds = getRowId ? data.map((d) => getRowId(d)) : [];
  const allSelected =
    selectable && rowIds.length > 0 && rowIds.every((id) => selectedIds.includes(id));
  const colSpan = columns.length + (selectable ? 1 : 0);

  // İlk yükleme (veri yokken) tam spinner gösterir; arama/filtre refetch'inde
  // ise mevcut satırlar korunur ve hafifçe soluklaşır (web'deki keepPreviousData davranışı).
  const isInitialLoad = loading && data.length === 0;
  const isRefetching = loading && data.length > 0;

  return (
    <div className="admin-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="admin-table w-full">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {selectable && (
                  <th className="w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary-600"
                      checked={!!allSelected}
                      onChange={() => onToggleAll?.(rowIds)}
                      aria-label="Tümünü seç"
                    />
                  </th>
                )}
                {hg.headers.map((h) => (
                  <th key={h.id} className="text-left">
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody
            className={
              isRefetching
                ? "opacity-60 transition-opacity duration-200 pointer-events-none"
                : "transition-opacity duration-200"
            }
          >
            {isInitialLoad ? (
              <tr>
                <td colSpan={colSpan} className="p-8 text-center text-muted">
                  <Spinner size="md" className="mx-auto" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="p-8 text-center text-muted">
                  <div className="flex flex-col items-center gap-3">
                    <span>{emptyText}</span>
                    {emptyAction}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const id = getRowId ? getRowId(row.original) : row.id;
                const isExpanded = renderExpanded != null && expandedId === id;
                return (
                  <Fragment key={row.id}>
                  <tr
                    onClick={
                      onRowClick
                        ? (e) => {
                            // Satır içindeki interaktif öğelere (link, buton, input, label)
                            // tıklama satır tıklamasını tetiklemez — kendi davranışları çalışır.
                            if (
                              (e.target as HTMLElement).closest(
                                "a, button, input, select, textarea, label, [role='button']",
                              )
                            )
                              return;
                            onRowClick(row.original);
                          }
                        : undefined
                    }
                    className={[
                      onRowClick ? "cursor-pointer hover:bg-surface-alt/50" : "",
                      selectable && selectedIds.includes(id)
                        ? "bg-primary-500/5"
                        : "",
                      rowClassName?.(row.original) ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {selectable && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary-600"
                          checked={selectedIds.includes(id)}
                          onChange={() => onToggleRow?.(id)}
                          aria-label="Satırı seç"
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {renderExpanded && (
                    <tr className="hover:bg-transparent">
                      <td colSpan={colSpan} className="!p-0 !border-0">
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              key="expanded"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              {renderExpanded(row.original)}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
