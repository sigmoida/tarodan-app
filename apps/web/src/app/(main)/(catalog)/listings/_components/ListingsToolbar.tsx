/** @format */

"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FunnelIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button, Chip, Select } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import { formatCondition } from "@/lib/format";
import ProductLayoutSelector from "./ProductLayoutSelector";
import { useListings } from "../_context/ListingsContext";

/**
 * The page-header controls (rendered in the shared `PageHeader`'s actions slot):
 * the mobile "Filtreler" button, the product-layout selector and the sort Select.
 * The title + result count live in the PageHeader itself (see ListingsClient).
 */
export default function ListingsControls() {
  const t = useTranslations();
  const {
    filters,
    productLayout,
    setProductLayout,
    activeFilterCount,
    setShowMobileSidebar,
    handleFiltersChange,
  } = useListings();

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <Button
        variant="secondary"
        onClick={() => setShowMobileSidebar(true)}
        className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-xs sm:text-sm font-medium hover:bg-surface transition-colors flex-shrink-0"
      >
        <FunnelIcon className="w-4 h-4" />
        <span className="hidden sm:inline">{t("product.filters")}</span>
        {activeFilterCount > 0 && (
          <span className="px-1.5 py-0.5 bg-primary-500 text-inverted text-2xs font-bold rounded-sm">
            {activeFilterCount}
          </span>
        )}
      </Button>
      <ProductLayoutSelector
        layout={productLayout}
        onLayoutChange={setProductLayout}
        storageKey="listings-product-layout"
      />
      <Select
        value={filters.sortBy}
        onChange={(e) =>
          handleFiltersChange({ ...filters, sortBy: e.target.value })
        }
        className="w-auto flex-shrink-0"
      >
        <option value="relevance">{t("common.recommended")}</option>
        <option value="created_desc">{t("product.sortNewest")}</option>
        <option value="created_asc">{t("product.sortOldest")}</option>
        <option value="view_count_desc">{t("product.sortPopular")}</option>
        <option value="price_asc">{t("product.sortPriceLow")}</option>
        <option value="price_desc">{t("product.sortPriceHigh")}</option>
        <option value="rating_desc">{t("product.sortHighestRating")}</option>
        <option value="title_asc">A-Z</option>
        <option value="title_desc">Z-A</option>
      </Select>
    </div>
  );
}

const MATERIAL_LABELS: Record<string, string> = {
  diecast: "Diecast (Metal)",
  resin: "Resin (Reçine)",
  composite: "Composite",
  plastic: "Plastic",
};

// Per-filter active tint for the removable Chip.
const CHIP_TINT = {
  success: "border-success-200 bg-success-500/10 text-success-600",
  warning: "border-warning-200 bg-warning-500/10 text-warning-600",
  info: "border-info-200 bg-info-500/10 text-info-600",
  danger: "border-danger-200 bg-danger-500/10 text-danger-600",
} as const;

/**
 * The active-filter chips row rendered above the grid. Every active filter is a
 * removable `@tarodan/ui` Chip; the whole chip is the remove control.
 */
export function ActiveFilterChips() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    filters,
    filtersForSidebar,
    currentSearch,
    activeFilterCount,
    setFilters,
    setCurrentPage,
    handleFiltersChange,
    clearFilters,
  } = useListings();

  if (activeFilterCount === 0) return null;

  type ChipDesc = {
    key: string;
    label: ReactNode;
    onRemove: () => void;
    tint?: keyof typeof CHIP_TINT;
  };
  const chips: ChipDesc[] = [];

  if (currentSearch) {
    chips.push({
      key: "search",
      label: `${t("common.search")}: "${currentSearch}"`,
      onRemove: () => {
        setFilters({ ...filters, search: "" });
        setCurrentPage(1);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("search");
        params.delete("page");
        router.replace(
          params.toString() ? `/listings?${params.toString()}` : "/listings",
        );
      },
    });
  }

  const valueFilters: Array<{ k: string; v?: string }> = [
    { k: "category", v: filtersForSidebar.category },
    { k: "brand", v: filters.brand },
    { k: "carModel", v: filters.carModel },
    { k: "scale", v: filters.scale },
    { k: "material", v: filters.material },
    { k: "condition", v: filters.condition },
    { k: "manufacturer", v: filters.manufacturer },
  ];
  for (const { k, v } of valueFilters) {
    if (!v) continue;
    const label =
      k === "condition"
        ? formatCondition(v, locale)
        : k === "material"
          ? MATERIAL_LABELS[v] || v
          : v;
    chips.push({
      key: k,
      label,
      onRemove: () => {
        const updates: any = { ...filters, [k]: "" };
        if (k === "manufacturer") updates.manufacturerId = "";
        if (k === "brand") {
          updates.brandId = "";
          updates.carModelId = "";
          updates.carModel = "";
        }
        if (k === "category") updates.categoryId = "";
        if (k === "carModel") updates.carModelId = "";
        handleFiltersChange(updates);
      },
    });
  }

  if (filters.minPrice || filters.maxPrice) {
    chips.push({
      key: "price",
      label: `₺${filters.minPrice || "0"} - ₺${filters.maxPrice || "∞"}`,
      onRemove: () =>
        handleFiltersChange({ ...filters, minPrice: "", maxPrice: "" }),
    });
  }

  const boolFilters: Array<{
    key: string;
    on: boolean;
    label: string;
    tint?: keyof typeof CHIP_TINT;
    patch: Record<string, unknown>;
  }> = [
    {
      key: "tradeOnly",
      on: !!filters.tradeOnly,
      label: t("product.tradeAvailable"),
      tint: "success",
      patch: { tradeOnly: false },
    },
    {
      key: "preOrder",
      on: !!filters.preOrder,
      label: t("product.preOrder"),
      patch: { preOrder: false },
    },
    {
      key: "limited",
      on: !!filters.limited,
      label: t("product.limitedEdition"),
      tint: "warning",
      patch: { limited: false },
    },
    {
      key: "set",
      on: !!filters.set,
      label: t("product.sets"),
      tint: "info",
      patch: { set: false },
    },
    {
      key: "discountOnly",
      on: !!filters.discountOnly,
      label: t("product.onSale"),
      tint: "danger",
      patch: { discountOnly: false },
    },
  ];
  for (const b of boolFilters) {
    if (!b.on) continue;
    chips.push({
      key: b.key,
      label: b.label,
      tint: b.tint,
      onRemove: () => handleFiltersChange({ ...filters, ...b.patch }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-border">
      <span className="text-xs font-medium text-muted uppercase tracking-wide mr-1">
        {t("product.filters")}:
      </span>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          active
          activeClassName={chip.tint ? CHIP_TINT[chip.tint] : undefined}
          onClick={chip.onRemove}
          aria-label={`${t("common.remove")}: ${
            typeof chip.label === "string" ? chip.label : chip.key
          }`}
          className="inline-flex items-center gap-1 font-medium"
        >
          {chip.label}
          <XMarkIcon className="w-3.5 h-3.5" />
        </Chip>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={clearFilters}
        className="ml-1 text-primary-600 hover:text-primary-700 font-medium"
      >
        {t("product.clearFilters")}
      </Button>
    </div>
  );
}
