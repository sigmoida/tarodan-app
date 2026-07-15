"use client";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Badge,
  Button,
  Checkbox,
  Input,
  Radio,
} from "@tarodan/ui";
import { useSidebarFilters } from "../_hooks/useSidebarFilters";
import type { Filters } from "../_lib/params";

interface SidebarFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

// Selected/active row styling reused by every option list.
const rowClass = (selected: boolean) =>
  `flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
    selected ? "bg-primary-100 text-primary-700" : "text-body hover:bg-surface"
  }`;

export default function SidebarFilters({
  filters,
  onFilterChange,
  activeFilterCount,
}: SidebarFiltersProps) {
  const {
    t,
    openSections,
    setOpenSections,
    brandSearch,
    setBrandSearch,
    manufacturerSearch,
    setManufacturerSearch,
    modelSearch,
    setModelSearch,
    categorySearch,
    setCategorySearch,
    scaleSearch,
    setScaleSearch,
    materialSearch,
    setMaterialSearch,
    customAttrSearch,
    setCustomAttrSearch,
    filteredCategories,
    filteredBrands,
    modelsForBrand,
    filteredScales,
    filteredMaterials,
    displayManufacturers,
    customAttrGroups,
    CONDITIONS,
    handleCategoryChange,
    handleBrandChange,
    handleCarModelChange,
    handleScaleChange,
    handleMaterialChange,
    handleManufacturerChange,
    toggleCustomAttribute,
    handleConditionChange,
  } = useSidebarFilters({ filters, onFilterChange });

  // Shown when a search filters an option list down to nothing.
  const noResults = (
    <p className="px-2 py-3 text-sm text-muted text-center">
      {t("common.noResults")}
    </p>
  );

  // A compact search box reused above each searchable option list.
  const searchBox = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <Input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputSize="sm"
      className="rounded border-border focus:border-primary-400 mb-2"
    />
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-heading">
            {t("product.filters")}
          </span>
          {activeFilterCount > 0 && (
            <Badge
              variant="primary"
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
            {searchBox(
              categorySearch,
              setCategorySearch,
              t("product.searchTypes"),
            )}
            {filteredCategories.length === 0 ? (
              noResults
            ) : (
              <div className="space-y-1">
                {filteredCategories.map((cat) => {
                  const isSelected = filters.categoryId === cat.id;
                  return (
                    <label key={cat.id} className={rowClass(isSelected)}>
                      <Radio
                        name="category"
                        checked={isSelected}
                        onChange={() => handleCategoryChange(cat.id, cat.name)}
                        className="w-4 h-4 text-primary-500 focus:ring-primary-400"
                      />
                      <span className="text-sm">{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Marka */}
        <AccordionItem value="brand">
          <AccordionTrigger>{t("product.brand")}</AccordionTrigger>
          <AccordionContent>
            <Input
              type="text"
              placeholder={t("brands.searchPlaceholder")}
              value={brandSearch}
              onChange={(e) => setBrandSearch(e.target.value)}
              inputSize="sm"
              className="rounded border-border focus:border-primary-400 mb-2"
            />
            <div className="space-y-1">
              {filteredBrands.length === 0 && noResults}
              {filteredBrands.map((brand) => {
                const isSelected = filters.brandId
                  ? filters.brandId === brand.id
                  : filters.brand === brand.name;
                return (
                  <label key={brand.id} className={rowClass(isSelected)}>
                    <Radio
                      name="brand"
                      checked={isSelected}
                      onChange={() => handleBrandChange(brand.id, brand.name)}
                      className="w-4 h-4 text-primary-500 focus:ring-primary-400"
                    />
                    <span className="text-sm">{brand.name}</span>
                  </label>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Model */}
        <AccordionItem value="model">
          <AccordionTrigger>Model</AccordionTrigger>
          <AccordionContent>
            <Input
              type="text"
              placeholder={t("product.searchModels")}
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              inputSize="sm"
              className="rounded border-border focus:border-primary-400 mb-2"
            />
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {modelsForBrand.length === 0 && noResults}
              {modelsForBrand.map((m) => {
                const isSelected = filters.carModelId === m.id;
                return (
                  <label key={m.id} className={rowClass(isSelected)}>
                    <Radio
                      name="carModel"
                      checked={isSelected}
                      onChange={() => handleCarModelChange(m.id, m.name)}
                      className="w-4 h-4 text-primary-500 focus:ring-primary-400"
                    />
                    <span className="text-sm">{m.name}</span>
                  </label>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Ölçek */}
        <AccordionItem value="scale">
          <AccordionTrigger>{t("product.scale")}</AccordionTrigger>
          <AccordionContent>
            {searchBox(scaleSearch, setScaleSearch, t("product.searchScale"))}
            {filteredScales.length === 0 ? (
              noResults
            ) : (
              <div className="space-y-1">
                {filteredScales.map((scale) => {
                  const isSelected = filters.scale === scale;
                  return (
                    <label key={scale} className={rowClass(isSelected)}>
                      <Radio
                        name="scale"
                        checked={isSelected}
                        onChange={() => handleScaleChange(scale)}
                        className="w-4 h-4 text-primary-500 focus:ring-primary-400"
                      />
                      <span className="text-sm">{scale}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Malzeme (Material) */}
        <AccordionItem value="material">
          <AccordionTrigger>{t("product.material")}</AccordionTrigger>
          <AccordionContent>
            {searchBox(
              materialSearch,
              setMaterialSearch,
              t("product.searchMaterial"),
            )}
            {filteredMaterials.length === 0 ? (
              noResults
            ) : (
              <div className="space-y-1">
                {filteredMaterials.map((m) => {
                  const isSelected = filters.material === m.slug;
                  return (
                    <label key={m.slug} className={rowClass(isSelected)}>
                      <Radio
                        name="material"
                        checked={isSelected}
                        onChange={() => handleMaterialChange(m.slug)}
                        className="w-4 h-4 text-primary-500 focus:ring-primary-400"
                      />
                      <span className="text-sm">{m.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Üretici */}
        <AccordionItem value="manufacturer">
          <AccordionTrigger>{t("product.manufacturer")}</AccordionTrigger>
          <AccordionContent>
            <Input
              type="text"
              placeholder={t("product.searchManufacturers")}
              value={manufacturerSearch}
              onChange={(e) => setManufacturerSearch(e.target.value)}
              inputSize="sm"
              className="rounded border-border focus:border-primary-400 mb-2"
            />
            <div className="space-y-1">
              {displayManufacturers.length === 0 && noResults}
              {displayManufacturers.map((m) => {
                const isSelected = m.id
                  ? filters.manufacturerId === m.id
                  : filters.manufacturer === m.name;
                return (
                  <label key={m.id || m.name} className={rowClass(isSelected)}>
                    <Radio
                      name="manufacturer"
                      checked={isSelected}
                      onChange={() => handleManufacturerChange(m.id, m.name)}
                      className="w-4 h-4 text-primary-500 focus:ring-primary-400"
                    />
                    <span className="text-sm">{m.name}</span>
                  </label>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Manufacturer-scoped custom attribute groups (e.g. Hot Wheels Segment/Assortment/...) */}
        {customAttrGroups.map((group) => {
          const selected = new Set(
            filters.customAttributes?.[group.slug] ?? [],
          );
          const searchTerm = customAttrSearch[group.slug] ?? "";
          const filteredAttrs = searchTerm
            ? group.attributes.filter((a) =>
                a.label.toLowerCase().includes(searchTerm.toLowerCase()),
              )
            : group.attributes;
          const showSearch = group.attributes.length > 15;
          return (
            <AccordionItem key={group.slug} value={`customAttr:${group.slug}`}>
              <AccordionTrigger>
                <span className="flex items-center">
                  {group.name}
                  {selected.size > 0 && (
                    <Badge variant="primary" size="sm" className="ml-2">
                      {selected.size}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {showSearch && (
                  <Input
                    type="text"
                    placeholder={t("product.searchAttribute", {
                      name: group.name,
                    })}
                    value={searchTerm}
                    onChange={(e) =>
                      setCustomAttrSearch((s) => ({
                        ...s,
                        [group.slug]: e.target.value,
                      }))
                    }
                    inputSize="sm"
                    className="rounded border-border focus:border-primary-400 mb-2"
                  />
                )}
                <div
                  className={`space-y-1 ${group.attributes.length > 15 ? "max-h-64 overflow-y-auto" : ""}`}
                >
                  {filteredAttrs.map((attr) => {
                    const isSelected = selected.has(attr.slug);
                    return (
                      <label key={attr.slug} className={rowClass(isSelected)}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() =>
                            toggleCustomAttribute(group.slug, attr.slug)
                          }
                          className="w-4 h-4"
                        />
                        {attr.color && (
                          <span
                            className="w-3 h-3 rounded-full border border-border-subtle flex-shrink-0"
                            style={{ backgroundColor: attr.color }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="text-sm">{attr.label}</span>
                      </label>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}

        {/* Durum */}
        <AccordionItem value="condition">
          <AccordionTrigger>{t("product.condition")}</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1">
              {CONDITIONS.map((condition) => (
                <label
                  key={condition.value}
                  className={rowClass(filters.condition === condition.value)}
                >
                  <Radio
                    name="condition"
                    checked={filters.condition === condition.value}
                    onChange={() => handleConditionChange(condition.value)}
                    className="w-4 h-4 text-primary-500 focus:ring-primary-400"
                  />
                  <span className="text-sm">{condition.label}</span>
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Fiyat */}
        <AccordionItem value="price">
          <AccordionTrigger>{t("product.price")}</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  placeholder="Min ₺"
                  value={filters.minPrice}
                  onChange={(e) =>
                    onFilterChange({ ...filters, minPrice: e.target.value })
                  }
                  inputSize="sm"
                  className="flex-1 min-w-0 px-2 rounded border-border focus:border-primary-400"
                />
                <span className="text-subtle flex-shrink-0">-</span>
                <Input
                  type="number"
                  placeholder="Max ₺"
                  value={filters.maxPrice}
                  onChange={(e) =>
                    onFilterChange({ ...filters, maxPrice: e.target.value })
                  }
                  inputSize="sm"
                  className="flex-1 min-w-0 px-2 rounded border-border focus:border-primary-400"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {["0-100", "100-500", "500-1000", "1000+"].map((range) => {
                  const [min, max] = range.split("-");
                  const isActive =
                    filters.minPrice === (min || "") &&
                    filters.maxPrice === (max || "");
                  return (
                    <Button
                      variant="secondary"
                      key={range}
                      onClick={() => {
                        if (isActive) {
                          onFilterChange({
                            ...filters,
                            minPrice: "",
                            maxPrice: "",
                          });
                        } else {
                          onFilterChange({
                            ...filters,
                            minPrice: min === "1000+" ? "1000" : min,
                            maxPrice: max === undefined ? "" : max,
                          });
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        isActive
                          ? "bg-primary-500 text-inverted"
                          : "bg-surface-alt text-muted hover:bg-border-subtle"
                      }`}
                    >
                      {range === "1000+" ? "₺1000+" : `₺${range}`}
                    </Button>
                  );
                })}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Diğer Seçenekler */}
        <AccordionItem value="options">
          <AccordionTrigger>{t("product.options")}</AccordionTrigger>
          <AccordionContent>
            <label className="flex items-center gap-3 px-2 py-2 rounded cursor-pointer hover:bg-surface">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
