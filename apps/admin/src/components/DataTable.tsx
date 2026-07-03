"use client";

import { Fragment, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import {
  Spinner,
  Checkbox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@tarodan/ui";
import { type CellAlign } from "@/components/table/meta";

export type { ColumnDef };

const ALIGN_CLASS: Record<CellAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

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
 * design-system `Table`/`Checkbox` (legacy `.admin-table`/`.admin-card` yok).
 * Sütunlar ColumnDef ile tanımlanır; loading/empty, satır-tık ve opsiyonel
 * çoklu-seçim / genişletilebilir satır dahili yönetilir.
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

  // Boyut sistemi opt-in: kolonlar `col.*` factory'sinden geldiyse (meta taşırsa)
  // fixed-layout + colgroup + hizalama devreye girer. Meta yoksa (legacy ham
  // ColumnDef tüketicileri) tablo aynen eski davranışta kalır.
  const hasSizing = columns.some(
    (c) => c.meta && (c.meta.minWidth != null || c.meta.grow != null || c.meta.align != null),
  );
  // Genişlik tabanı: her kolon minWidth px alır; tablonun min-width'i bunların
  // toplamıdır. Konteyner bu eşiğin ÜSTÜNDE ise kolonlar orantılı büyür; ALTINDA
  // ise tablo min-width'te kalır ve wrapper yatay scroll'a düşer. (min-width'i
  // `<col>`'a koymak işe yaramaz — tarayıcı yok sayar; bu yüzden `<table>`'a.)
  const colMin = (c: (typeof columns)[number]) => c.meta?.minWidth ?? 140;
  const tableMinWidth = hasSizing
    ? (selectable ? 44 : 0) + columns.reduce((sum, c) => sum + colMin(c), 0)
    : 0;
  const alignOf = (align?: CellAlign) => (align ? ALIGN_CLASS[align] : undefined);

  // İlk yükleme (veri yokken) tam spinner; arama/filtre refetch'inde mevcut
  // satırlar korunur ve hafifçe soluklaşır (keepPreviousData davranışı).
  const isInitialLoad = loading && data.length === 0;
  const isRefetching = loading && data.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-sm">
      <div className="overflow-x-auto">
        <Table
          scrollable={false}
          className={hasSizing ? "table-fixed" : undefined}
          style={hasSizing ? { minWidth: `${tableMinWidth}px` } : undefined}
        >
          {hasSizing && (
            <colgroup>
              {selectable && <col style={{ width: "44px" }} />}
              {columns.map((c, i) => (
                <col key={c.id ?? i} style={{ width: `${colMin(c)}px` }} />
              ))}
            </colgroup>
          )}
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={!!allSelected}
                      onChange={() => onToggleAll?.(rowIds)}
                      aria-label="Tümünü seç"
                    />
                  </TableHead>
                )}
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={alignOf(h.column.columnDef.meta?.align)}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            className={
              isRefetching
                ? "opacity-60 transition-opacity duration-200 pointer-events-none"
                : "transition-opacity duration-200"
            }
          >
            {isInitialLoad ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="p-8 text-center text-muted">
                  <Spinner size="md" className="mx-auto" />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="p-8 text-center text-muted">
                  <div className="flex flex-col items-center gap-3">
                    <span>{emptyText}</span>
                    {emptyAction}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const id = getRowId ? getRowId(row.original) : row.id;
                const isExpanded = renderExpanded != null && expandedId === id;
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      onClick={
                        onRowClick
                          ? (e) => {
                              // Satır içindeki interaktif öğelere tıklama satır
                              // tıklamasını tetiklemez — kendi davranışları çalışır.
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
                        onRowClick ? "cursor-pointer" : "",
                        selectable && selectedIds.includes(id) ? "bg-primary-500/5" : "",
                        rowClassName?.(row.original) ?? "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {selectable && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(id)}
                            onChange={() => onToggleRow?.(id)}
                            aria-label="Satırı seç"
                          />
                        </TableCell>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={alignOf(cell.column.columnDef.meta?.align)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {renderExpanded && (
                      <TableRow className="!border-t-0 hover:bg-transparent">
                        <TableCell colSpan={colSpan} className="!p-0">
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
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
