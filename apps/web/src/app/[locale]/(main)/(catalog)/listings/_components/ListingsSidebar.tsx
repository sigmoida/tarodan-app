"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import MobileDrawer from "@/components/layout/MobileDrawer";
import SidebarFilters from "./SidebarFilters";
import { useListings } from "../_context/ListingsContext";

/**
 * Desktop sidebar card + the mobile drawer. A plain static column — the filter
 * sections collapse via the shared Accordion, so no sticky positioning.
 *
 * Mobil panel, gezinme çekmeceleriyle AYNI `MobileDrawer` gövdesini kullanır:
 * marka başlığı, masaüstüne büyüyünce kapanma ve Radix'in odak tuzağı / Escape
 * / kaydırma kilidi. Eskiden burada elle yazılmış bir overlay vardı; bunların
 * hiçbiri yoktu ve panel açıkken arkadaki liste kaydırılabiliyordu.
 *
 * Açık durumu paylaşılan gezinme store'undan DEĞİL sayfa bağlamından gelir:
 * `/listings` sayfasında hamburger da var; ikisi tek durumu paylaşsaydı bir
 * dokunuş her iki paneli birden açardı.
 */
export default function ListingsSidebar() {
  const t = useTranslations();
  const {
    filtersForSidebar,
    activeFilterCount,
    showMobileSidebar,
    setShowMobileSidebar,
    handleFiltersChange,
    clearFilters,
  } = useListings();

  const closeMobileSidebar = useCallback(
    () => setShowMobileSidebar(false),
    [setShowMobileSidebar],
  );

  const filters = (
    <SidebarFilters
      filters={filtersForSidebar}
      onFilterChange={handleFiltersChange}
      activeFilterCount={activeFilterCount}
      onClearFilters={clearFilters}
    />
  );

  return (
    <>
      {/* Sidebar Filters (Desktop) */}
      <div className="hidden lg:block w-56 flex-shrink-0">
        <div className="bg-surface-elevated rounded-lg border border-border overflow-hidden">
          {filters}
        </div>
      </div>

      <MobileDrawer
        isOpen={showMobileSidebar}
        onClose={closeMobileSidebar}
        title={t("product.filters")}
      >
        <div className="p-4">{filters}</div>
      </MobileDrawer>
    </>
  );
}
