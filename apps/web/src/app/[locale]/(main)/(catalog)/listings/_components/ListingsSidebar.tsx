"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import MobileDrawer from "@/components/layout/MobileDrawer";
import SidebarFilters from "./SidebarFilters";
import { useListings } from "../_context/ListingsContext";

/**
 * Desktop sidebar card + the mobile drawer.
 *
 * Masaüstünde sütun `sticky` ve KENDİ İÇİNDE kaydırılır. Eskiden sayfayla
 * birlikte akan sade bir sütundu; filtre listelerinin hiçbirinde yükseklik
 * sınırı olmadığı için (özellikle yüzlerce satırlık üretici listesi) sütun
 * sonuç ızgarasından metrelerce uzun oluyor, kullanıcı yanında bomboş bir
 * alanla birlikte sayfayı aşağı kaydırmak zorunda kalıyordu. Bölüm içi
 * listeler artık kendi sınırlarını taşıyor (`FilterOptionList`), sütun da
 * görüntü alanına sabitlenip taşma durumunda kendi içinde kayıyor — sonuçlar
 * ile filtreler birbirinden bağımsız kaydırılıyor.
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
      <div className="hidden w-56 flex-shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-elevated">
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
