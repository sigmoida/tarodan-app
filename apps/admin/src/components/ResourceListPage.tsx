"use client";

import { type ReactNode } from "react";
import { PageHeader, FilterToolbar, BulkActionBar } from "@/components/admin-list";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { AdminTabs } from "@/components/AdminTabs";

// ─── Props ─────────────────────────────────────────────────────────────────

interface SearchConfig {
  /** FilterToolbar'daki arama kutusu placeholder'ı */
  placeholder?: string;
}

/** Sekme tanımı — AdminTabs'ın AdminTab tipine karşılık gelir (icon hariç; o sekme özelinde eklenir) */
interface TabConfig {
  key: string;
  label: string;
  /** Opsiyonel sayaç/rozet */
  badge?: number | string;
}

export interface ResourceListPageProps<T> {
  // ── Başlık alanı ──────────────────────────────────────────────────────────
  title: string;
  description?: ReactNode;
  /**
   * PageHeader'ın sağına yerleşen aksiyon slot'u.
   * Örn. "N takas inceleme bekliyor" uyarı butonu, badge'ler.
   */
  headerActions?: ReactNode;

  // ── Sekmeler (opsiyonel) ──────────────────────────────────────────────────
  /**
   * Tanımlanırsa FilterToolbar/filtrelerin ÜSTÜNDE AdminTabs ile sekmeler görünür.
   * Veri değişimi sayfanın sorumluluğundadır; bu prop sadece sekme UI'ını sağlar.
   */
  tabs?: TabConfig[];
  /** Aktif sekme anahtarı (controlled). tabs ile birlikte verilmeli. */
  activeTab?: string;
  /** Sekme değişince çağrılır. Veri güncelleme sayfanın işi. */
  onTabChange?: (key: string) => void;

  // ── Arama + Filtreler ─────────────────────────────────────────────────────
  /**
   * Tanımlanırsa FilterToolbar görünür ve arama kutusu gösterilir.
   * Tanımlanmazsa sadece `filters` children'ı görünür (arama kutusu olmadan).
   */
  search?: SearchConfig;
  /** Arama kutusu değeri (useAdminResource'tan gelen `search`) */
  searchValue?: string;
  /** Arama kutusu onChange (useAdminResource'tan gelen `setSearch`) */
  onSearchChange?: (v: string) => void;
  /** Enter tetikleyicisi (useAdminResource'tan gelen `onSearchSubmit`) */
  onSearchSubmit?: () => void;
  /**
   * FilterToolbar içinde arama kutusunun sağına render edilecek filtre kontrolleri.
   * Select'ler, date picker'lar vb.
   * `search` prop yoksa sadece bu filters gösterilir (FilterToolbar yerine doğrudan div).
   */
  filters?: ReactNode;

  // ── Tablo ─────────────────────────────────────────────────────────────────
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  getRowId: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;

  // ── Toplu seçim (opsiyonel) ───────────────────────────────────────────────
  /** true ise DataTable'da satır başı checkbox gösterilir */
  selectable?: boolean;
  /** Seçili satır id'leri (dışarıdan controlled) */
  selectedIds?: string[];
  /** Tek satır seçim/kaldırma callback'i */
  onToggleRow?: (id: string) => void;
  /** Tümünü seç/kaldır callback'i (geçerli sayfadaki id'leri alır) */
  onToggleAll?: (ids: string[]) => void;
  /**
   * Seçili satırlar varken BulkActionBar içinde gösterilecek aksiyon butonları.
   * Örn. <Button onClick={handleBulkDelete}>Sil</Button>
   */
  bulkActions?: ReactNode;
  /** "Seçimi temizle" callback'i — BulkActionBar'ın onClear'ına aktarılır */
  onClearSelection?: () => void;

  // ── Pagination ────────────────────────────────────────────────────────────
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * Admin liste sayfaları için ortak kabuk:
 * PageHeader + (opsiyonel) AdminTabs + (opsiyonel) BulkActionBar
 * + FilterToolbar (opsiyonel arama + filtreler) + DataTable + Pagination.
 *
 * Sayfa, sadece kolon/filtre/aksiyon tanımı yapar; layout ve ortak davranış burada.
 *
 * Kullanım:
 * ```tsx
 * <ResourceListPage
 *   title="Takaslar"
 *   description={`Toplam ${total} takas`}
 *   headerActions={<Button>...</Button>}
 *   // Sekmeler (opsiyonel):
 *   tabs={[{ key: "all", label: "Tümü" }, { key: "active", label: "Aktif", badge: 3 }]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   // Arama:
 *   search={{ placeholder: "Takas no ara..." }}
 *   searchValue={search}
 *   onSearchChange={setSearch}
 *   onSearchSubmit={onSearchSubmit}
 *   filters={<Select .../>}
 *   // Toplu seçim (opsiyonel):
 *   selectable
 *   selectedIds={selectedIds}
 *   onToggleRow={toggleRow}
 *   onToggleAll={toggleAll}
 *   bulkActions={<Button onClick={handleBulkDelete}>Sil</Button>}
 *   onClearSelection={clearSelection}
 *   // Tablo:
 *   columns={columns}
 *   data={rows}
 *   loading={isLoading}
 *   getRowId={(t) => t.id}
 *   rowClassName={(t) => t.hasDispute ? "bg-danger-900/10" : ""}
 *   page={page}
 *   totalPages={totalPages}
 *   onPageChange={setPage}
 * />
 * ```
 */
export function ResourceListPage<T>({
  title,
  description,
  headerActions,
  // Sekmeler
  tabs,
  activeTab,
  onTabChange,
  // Arama + filtreler
  search,
  searchValue = "",
  onSearchChange,
  onSearchSubmit,
  filters,
  // Tablo
  columns,
  data,
  loading,
  emptyText = "Kayıt bulunamadı",
  getRowId,
  rowClassName,
  // Toplu seçim
  selectable,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  bulkActions,
  onClearSelection,
  // Pagination
  page,
  totalPages,
  onPageChange,
}: ResourceListPageProps<T>) {
  // Toolbar: arama varsa FilterToolbar, sadece filtreler varsa sade div, ikisi de yoksa null
  const hasSearch = !!search;
  const hasFilters = !!filters;

  const toolbar = hasSearch ? (
    <FilterToolbar
      search={searchValue}
      onSearchChange={onSearchChange ?? (() => {})}
      onSearchSubmit={onSearchSubmit}
      searchPlaceholder={search.placeholder ?? "Ara..."}
    >
      {filters}
    </FilterToolbar>
  ) : hasFilters ? (
    <div className="flex flex-col sm:flex-row gap-4">{filters}</div>
  ) : null;

  // Toplu seçim varsa ve en az 1 satır seçiliyse BulkActionBar göster
  const hasBulkSelection = selectable && selectedIds.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description}>
        {headerActions}
      </PageHeader>

      {/* Sekmeler — filtrelerden önce gelir */}
      {tabs && tabs.length > 0 && activeTab !== undefined && onTabChange && (
        <AdminTabs
          tabs={tabs}
          value={activeTab}
          onChange={onTabChange}
        />
      )}

      {toolbar}

      {/* Toplu seçim çubuğu — seçili satır varsa tablonun üstünde görünür */}
      {hasBulkSelection && (
        <BulkActionBar
          count={selectedIds.length}
          onClear={onClearSelection}
        >
          {bulkActions}
        </BulkActionBar>
      )}

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyText={emptyText}
        getRowId={getRowId}
        rowClassName={rowClassName}
        selectable={selectable}
        selectedIds={selectedIds}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
