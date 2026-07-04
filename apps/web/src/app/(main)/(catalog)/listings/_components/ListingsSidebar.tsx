'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import SidebarFilters from '@/components/SidebarFilters';
import { useListings } from '../_context/ListingsContext';

/**
 * Desktop sticky sidebar + the mobile drawer overlay. The sticky `top`/`maxHeight`
 * follow `barsHidden` so the panel hugs the top when the nav bars scroll away.
 */
export default function ListingsSidebar() {
  const { t } = useTranslation();
  const {
    filtersForSidebar,
    activeFilterCount,
    barsHidden,
    showMobileSidebar,
    setShowMobileSidebar,
    handleFiltersChange,
    clearFilters,
  } = useListings();

  return (
    <>
      {/* Sidebar Filters (Desktop) */}
      <div className="hidden lg:block w-56 flex-shrink-0">
        <div
          className="sticky overflow-y-auto bg-surface-elevated rounded border border-border transition-[top] duration-300"
          style={{
            top: barsHidden ? 8 : 116,
            maxHeight: `calc(100vh - ${barsHidden ? 16 : 124}px)`,
          }}
        >
          <SidebarFilters
            filters={filtersForSidebar}
            onFilterChange={handleFiltersChange}
            activeFilterCount={activeFilterCount}
            onClearFilters={clearFilters}
          />
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-heading/50" onClick={() => setShowMobileSidebar(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-surface-elevated shadow-xl flex flex-col overflow-y-auto">
            <div className="flex-shrink-0 flex items-center justify-between p-4 bg-surface-elevated border-b border-border-subtle z-10">
              <span className="font-semibold text-heading">{t('product.filters')}</span>
              <Button variant="secondary" onClick={() => setShowMobileSidebar(false)} className="p-2 hover:bg-surface-alt rounded">
                <XMarkIcon className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-4">
              <SidebarFilters
                filters={filtersForSidebar}
                onFilterChange={handleFiltersChange}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
