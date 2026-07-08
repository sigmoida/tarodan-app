"use client";

import { type ReactNode } from "react";
import { PageHeader, FilterToolbar, BulkActionBar } from "@/components/AdminList";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { AdminTabs } from "@/components/AdminTabs";

// ─── Props ─────────────────────────────────────────────────────────────────

interface SearchConfig {
  /** Search box placeholder in the FilterToolbar */
  placeholder?: string;
}

/** Tab definition — maps to AdminTabs' AdminTab type (except icon; that's added per-tab) */
interface TabConfig {
  key: string;
  label: string;
  /** Optional counter/badge */
  badge?: number | string;
}

export interface ResourceListPageProps<T> {
  // ── Header area ──────────────────────────────────────────────────────────
  title: string;
  description?: ReactNode;
  /**
   * Action slot placed to the right of PageHeader.
   * E.g. an "N trades awaiting review" warning button, badges.
   */
  headerActions?: ReactNode;

  // ── Tabs (optional) ──────────────────────────────────────────────────
  /**
   * If defined, tabs render ABOVE the FilterToolbar/filters via AdminTabs.
   * Data changes are the page's responsibility; this prop only provides the tab UI.
   */
  tabs?: TabConfig[];
  /** Active tab key (controlled). Must be provided together with tabs. */
  activeTab?: string;
  /** Called when the tab changes. Updating data is the page's job. */
  onTabChange?: (key: string) => void;

  // ── Search + Filters ─────────────────────────────────────────────────────
  /**
   * If defined, the FilterToolbar renders with a search box.
   * If not, only the `filters` children render (without a search box).
   */
  search?: SearchConfig;
  /** Search box value (`search` from useAdminResource) */
  searchValue?: string;
  /** Search box onChange (`setSearch` from useAdminResource) */
  onSearchChange?: (v: string) => void;
  /** Enter trigger (`onSearchSubmit` from useAdminResource) */
  onSearchSubmit?: () => void;
  /**
   * Filter controls rendered to the right of the search box in the FilterToolbar.
   * Selects, date pickers, etc.
   * Without the `search` prop, only these filters render (a plain div instead of FilterToolbar).
   */
  filters?: ReactNode;

  // ── Table ─────────────────────────────────────────────────────────────────
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  getRowId: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /**
   * Called when a row is clicked (e.g. go to detail). If provided, rows appear
   * clickable; clicking a link/button/input inside a row doesn't trigger it.
   */
  onRowClick?: (row: T) => void;
  /** Detail panel rendered full-width below the expanded row */
  renderExpanded?: (row: T) => ReactNode;
  /** Id of the currently expanded row (matches getRowId) */
  expandedId?: string | null;

  // ── Bulk selection (optional) ───────────────────────────────────────────────
  /** If true, a per-row checkbox is shown in the DataTable */
  selectable?: boolean;
  /** Selected row ids (controlled from outside) */
  selectedIds?: string[];
  /** Single-row select/deselect callback */
  onToggleRow?: (id: string) => void;
  /** Select/deselect-all callback (receives the current page's ids) */
  onToggleAll?: (ids: string[]) => void;
  /**
   * Action buttons shown in the BulkActionBar when rows are selected.
   * E.g. <Button onClick={handleBulkDelete}>Sil</Button>
   */
  bulkActions?: ReactNode;
  /** "Clear selection" callback — passed to BulkActionBar's onClear */
  onClearSelection?: () => void;

  // ── Pagination ────────────────────────────────────────────────────────────
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * Shared shell for admin list pages:
 * PageHeader + (optional) AdminTabs + (optional) BulkActionBar
 * + FilterToolbar (optional search + filters) + DataTable + Pagination.
 *
 * The page only defines columns/filters/actions; layout and shared behavior live here.
 *
 * Usage:
 * ```tsx
 * <ResourceListPage
 *   title="Takaslar"
 *   description={`Toplam ${total} takas`}
 *   headerActions={<Button>...</Button>}
 *   // Tabs (optional):
 *   tabs={[{ key: "all", label: "Tümü" }, { key: "active", label: "Aktif", badge: 3 }]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   // Search:
 *   search={{ placeholder: "Takas no ara..." }}
 *   searchValue={search}
 *   onSearchChange={setSearch}
 *   onSearchSubmit={onSearchSubmit}
 *   filters={<Select .../>}
 *   // Bulk selection (optional):
 *   selectable
 *   selectedIds={selectedIds}
 *   onToggleRow={toggleRow}
 *   onToggleAll={toggleAll}
 *   bulkActions={<Button onClick={handleBulkDelete}>Sil</Button>}
 *   onClearSelection={clearSelection}
 *   // Table:
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
  // Tabs
  tabs,
  activeTab,
  onTabChange,
  // Search + filters
  search,
  searchValue = "",
  onSearchChange,
  onSearchSubmit,
  filters,
  // Table
  columns,
  data,
  loading,
  emptyText = "Kayıt bulunamadı",
  getRowId,
  rowClassName,
  onRowClick,
  renderExpanded,
  expandedId,
  // Bulk selection
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
  // Toolbar: FilterToolbar if there's search, a plain div if only filters, null if neither
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

  // Show BulkActionBar when selectable and at least 1 row is selected
  const hasBulkSelection = selectable && selectedIds.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description}>
        {headerActions}
      </PageHeader>

      {/* Tabs — come before the filters */}
      {tabs && tabs.length > 0 && activeTab !== undefined && onTabChange && (
        <AdminTabs
          tabs={tabs}
          value={activeTab}
          onChange={onTabChange}
        />
      )}

      {toolbar}

      {/* Bulk selection bar — shown above the table when rows are selected */}
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
        onRowClick={onRowClick}
        renderExpanded={renderExpanded}
        expandedId={expandedId}
        selectable={selectable}
        selectedIds={selectedIds}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
