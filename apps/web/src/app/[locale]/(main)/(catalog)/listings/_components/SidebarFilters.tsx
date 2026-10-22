"use client";

import { Fragment, useId } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Badge,
  Button,
  Checkbox,
  Input,
} from "@tarodan/ui";
import type { Translate } from "@/types/i18n";
import { useSidebarFilters } from "../_hooks/useSidebarFilters";
import FilterOptionList, { type FilterOption } from "./FilterOptionList";
import {
  priceFilterIssue,
  priceFilterIssueMessage,
  priceFilterParam,
  priceRangeIssues,
  type Filters,
  type PriceFilterIssue,
} from "../_lib/params";

interface SidebarFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

// Quick price ranges as [min, max] bounds ("" = open); the mobile filter
// sheet offers the same four.
const PRICE_RANGES = [
  ["0", "100"],
  ["100", "500"],
  ["500", "1000"],
  ["1000", ""],
].map(([min, max]) => ({
  min,
  max,
  // The bounds the range sets, compared with the fields' bounds.
  bounds: `${priceFilterParam(min)}-${priceFilterParam(max)}`,
}));

// Boolean catalog flags shown after trade-only in the "options" group, in the
// mobile filter sheet's order; the keys are the Filters / URL / API param names.
const FLAG_OPTIONS = [
  { key: "preOrder", labelKey: "product.preOrder" },
  { key: "limited", labelKey: "product.limitedEdition" },
  { key: "set", labelKey: "product.sets" },
  { key: "discountOnly", labelKey: "product.onSale" },
] as const;

export default function SidebarFilters({
  filters,
  onFilterChange,
  activeFilterCount,
}: SidebarFiltersProps) {
  const {
    t,
    openSections,
    setOpenSections,
    categories,
    brandList,
    modelsForBrand,
    scaleList,
    materialList,
    colorList,
    displayManufacturers,
    customAttrGroups,
    CONDITIONS,
    handleCategoryChange,
    handleBrandChange,
    handleCarModelChange,
    handleScaleChange,
    handleMaterialChange,
    toggleColor,
    handleManufacturerChange,
    toggleCustomAttribute,
    handleConditionChange,
  } = useSidebarFilters({ filters, onFilterChange });
  const priceErrorId = useId();

  // Her bölüm aynı gövdeyi (arama + sınırlı yükseklik + boş durum) kullanır;
  // burada yalnız katalog kaydını seçenek biçimine çeviriyoruz.
  const noResults = t("common.noResults");

  const categoryOptions: FilterOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    id: c.id,
  }));

  const brandOptions: FilterOption[] = brandList.map((b) => ({
    value: b.id || b.name,
    label: b.name,
    id: b.id,
  }));

  const modelOptions: FilterOption[] = modelsForBrand.map((m) => ({
    value: m.id,
    label: m.name,
    id: m.id,
  }));

  const scaleOptions: FilterOption[] = scaleList.map((s) => ({
    value: s,
    label: s,
  }));

  const materialOptions: FilterOption[] = materialList.map((m) => ({
    value: m.slug,
    label: m.label,
  }));

  const colorOptions: FilterOption[] = colorList.map((c) => ({
    value: c.slug,
    label: c.label,
    color: c.color,
  }));

  const manufacturerOptions: FilterOption[] = displayManufacturers.map((m) => ({
    value: m.id || m.name,
    label: m.name,
    id: m.id,
    count: m._count?.products,
  }));

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-heading">
            {t("product.filters")}
          </span>
          {activeFilterCount > 0 && (
            <Badge
              variant="default"
              appearance="solid"
              size="sm"
              className="min-w-[18px] justify-center rounded-full px-1.5"
            >
              {activeFilterCount}
            </Badge>
          )}
        </div>
      </div>

      <Accordion
        type="multiple"
        value={openSections}
        onValueChange={setOpenSections}
      >
        {/* Araç Türü (Category) */}
        <AccordionItem value="category">
          <AccordionTrigger>{t("product.vehicleType")}</AccordionTrigger>
          <AccordionContent>
            <FilterOptionList
              name="category"
              options={categoryOptions}
              isSelected={(o) => filters.categoryId === o.id}
              onSelect={(o) => handleCategoryChange(o.id ?? "", o.label)}
              searchPlaceholder={t("product.searchTypes")}
              emptyText={noResults}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Marka */}
        <AccordionItem value="brand">
          <AccordionTrigger>{t("product.brand")}</AccordionTrigger>
          <AccordionContent>
            <FilterOptionList
              name="brand"
              options={brandOptions}
              isSelected={(o) =>
                filters.brandId
                  ? filters.brandId === o.id
                  : filters.brand === o.label
              }
              onSelect={(o) => handleBrandChange(o.id ?? "", o.label)}
              searchPlaceholder={t("brands.searchPlaceholder")}
              emptyText={noResults}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Model */}
        <AccordionItem value="model">
          <AccordionTrigger>Model</AccordionTrigger>
          <AccordionContent>
            <FilterOptionList
              name="carModel"
              options={modelOptions}
              isSelected={(o) => filters.carModelId === o.id}
              onSelect={(o) => handleCarModelChange(o.id ?? "", o.label)}
              searchPlaceholder={t("product.searchModels")}
              emptyText={noResults}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Ölçek */}
        <AccordionItem value="scale">
          <AccordionTrigger>{t("product.scale")}</AccordionTrigger>
          <AccordionContent>
            <FilterOptionList
              name="scale"
              options={scaleOptions}
              isSelected={(o) => filters.scale === o.value}
              onSelect={(o) => handleScaleChange(o.value)}
              searchPlaceholder={t("product.searchScale")}
              emptyText={noResults}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Malzeme (Material) */}
        <AccordionItem value="material">
          <AccordionTrigger>{t("product.material")}</AccordionTrigger>
          <AccordionContent>
            <FilterOptionList
              name="material"
              options={materialOptions}
              isSelected={(o) => filters.material === o.value}
              onSelect={(o) => handleMaterialChange(o.value)}
              searchPlaceholder={t("product.searchMaterial")}
              emptyText={noResults}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Renk — katalogdaki global "color" grubu; çoklu seçim (OR). */}
        {colorList.length > 0 && (
          <AccordionItem value="color">
            <AccordionTrigger>
              <span className="flex items-center">
                {t("product.color")}
                {(filters.colors?.length ?? 0) > 0 && (
                  <Badge variant="default" size="sm" className="ml-2">
                    {filters.colors.length}
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <FilterOptionList
                options={colorOptions}
                isSelected={(o) => (filters.colors ?? []).includes(o.value)}
                onSelect={(o) => toggleColor(o.value)}
                searchPlaceholder={t("product.color")}
                emptyText={noResults}
              />
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Üretici */}
        <AccordionItem value="manufacturer">
          <AccordionTrigger>{t("product.manufacturer")}</AccordionTrigger>
          <AccordionContent>
            <FilterOptionList
              name="manufacturer"
              options={manufacturerOptions}
              isSelected={(o) =>
                o.id
                  ? filters.manufacturerId === o.id
                  : filters.manufacturer === o.label
              }
              onSelect={(o) => handleManufacturerChange(o.id ?? "", o.label)}
              searchPlaceholder={t("product.searchManufacturers")}
              emptyText={noResults}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Manufacturer-scoped custom attribute groups (e.g. Hot Wheels Segment/Assortment/...) */}
        {customAttrGroups.map((group) => {
          const selected = new Set(
            filters.customAttributes?.[group.slug] ?? [],
          );
          const options: FilterOption[] = group.attributes.map((a) => ({
            value: a.slug,
            label: a.label,
            color: a.color,
          }));
          return (
            <AccordionItem key={group.slug} value={`customAttr:${group.slug}`}>
              <AccordionTrigger>
                <span className="flex items-center">
                  {group.name}
                  {selected.size > 0 && (
                    <Badge variant="default" size="sm" className="ml-2">
                      {selected.size}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <FilterOptionList
                  options={options}
                  isSelected={(o) => selected.has(o.value)}
                  onSelect={(o) => toggleCustomAttribute(group.slug, o.value)}
                  searchPlaceholder={t("product.searchAttribute", {
                    name: group.name,
                  })}
                  emptyText={noResults}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}

        {/* Durum */}
        <AccordionItem value="condition">
          <AccordionTrigger>{t("product.condition")}</AccordionTrigger>
          <AccordionContent>
            <FilterOptionList
              name="condition"
              options={CONDITIONS.map((c) => ({
                value: c.value,
                label: c.label,
              }))}
              isSelected={(o) => filters.condition === o.value}
              onSelect={(o) => handleConditionChange(o.value)}
              searchPlaceholder={t("product.condition")}
              emptyText={noResults}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Fiyat */}
        <AccordionItem value="price">
          <AccordionTrigger>{t("product.price")}</AccordionTrigger>
          <AccordionContent>
            <PriceRange
              filters={filters}
              onFilterChange={onFilterChange}
              errorId={priceErrorId}
              t={t}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Other options */}
        <AccordionItem value="options">
          <AccordionTrigger>{t("product.options")}</AccordionTrigger>
          <AccordionContent>
            <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-surface">
              <Checkbox
                checked={filters.tradeOnly}
                onChange={(e) =>
                  onFilterChange({ ...filters, tradeOnly: e.target.checked })
                }
                className="h-5 w-5"
              />
              <div>
                <span className="text-sm font-medium text-body">
                  {t("product.tradeAvailable")}
                </span>
                <p className="text-xs text-muted">
                  {t("product.tradeOnlyHint")}
                </p>
              </div>
            </label>
            {FLAG_OPTIONS.map(({ key, labelKey }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-surface"
              >
                <Checkbox
                  checked={filters[key]}
                  onChange={(e) =>
                    onFilterChange({ ...filters, [key]: e.target.checked })
                  }
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium text-body">
                  {t(labelKey)}
                </span>
              </label>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

/**
 * Min/max price fields and the quick ranges. The fields keep the typed text in
 * `filters` (see `priceFilterBound`): the search, the URL and the chip read
 * only the parsed bound, so refused text ("1.000") or a bound above the search
 * maximum filters nothing and shows its message (`priceFilterIssueMessage`,
 * one per issue, each field described by its own) instead of searching for
 * 1 TL or failing the search.
 */
function PriceRange({
  filters,
  onFilterChange,
  errorId,
  t,
}: {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  errorId: string;
  t: Translate;
}) {
  const fields = [
    { key: "minPrice", placeholder: "Min ₺", label: t("product.minPrice") },
    { key: "maxPrice", placeholder: "Max ₺", label: t("product.maxPrice") },
  ] as const;
  const issues = priceRangeIssues(filters);
  const messageId = (issue: PriceFilterIssue) => `${errorId}-${issue}`;
  // No range is active while a field has an issue: its "" would match an open
  // range bound ("1.000" next to max 100 is not "0-100").
  const bounds = issues.length
    ? null
    : `${priceFilterParam(filters.minPrice)}-${priceFilterParam(filters.maxPrice)}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {fields.map(({ key, placeholder, label }, i) => {
          const fieldIssue = priceFilterIssue(filters[key]);
          return (
            <Fragment key={key}>
              {i > 0 && <span className="flex-shrink-0 text-subtle">-</span>}
              <Input
                bare
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label={label}
                placeholder={placeholder}
                value={filters[key]}
                onChange={(e) =>
                  onFilterChange({ ...filters, [key]: e.target.value })
                }
                error={
                  fieldIssue
                    ? priceFilterIssueMessage(fieldIssue, t)
                    : undefined
                }
                aria-invalid={fieldIssue ? true : undefined}
                aria-describedby={
                  fieldIssue ? messageId(fieldIssue) : undefined
                }
                inputSize="sm"
                className="min-w-0 flex-1 rounded px-2"
              />
            </Fragment>
          );
        })}
      </div>
      {issues.map((issue) => (
        <p
          key={issue}
          id={messageId(issue)}
          role="alert"
          className="text-xs text-danger-600"
        >
          {priceFilterIssueMessage(issue, t)}
        </p>
      ))}
      <div className="flex flex-wrap gap-1">
        {PRICE_RANGES.map(({ min, max, bounds: rangeBounds }) => {
          // Compared as bounds, so "100,00" typed by hand lights "100".
          const isActive = bounds === rangeBounds;
          return (
            <Button
              variant="secondary"
              key={`${min}-${max}`}
              onClick={() =>
                onFilterChange({
                  ...filters,
                  minPrice: isActive ? "" : min,
                  maxPrice: isActive ? "" : max,
                })
              }
              className={`rounded px-2 py-1 text-xs transition-colors ${
                isActive
                  ? "bg-primary-500 text-inverted"
                  : "bg-surface-alt text-muted hover:bg-border-subtle"
              }`}
            >
              {max ? `₺${min}-${max}` : `₺${min}+`}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
