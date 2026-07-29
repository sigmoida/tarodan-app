"use client";

import { useMemo } from "react";
import { getCityNames, getDistrictsForCity } from "@/lib/turkeyLocations";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@tarodan/ui";

interface CityDistrictSelectorProps {
  city: string;
  district: string;
  onCityChange: (city: string) => void;
  onDistrictChange: (district: string) => void;
  cityPlaceholder?: string;
  districtPlaceholder?: string;
  className?: string;
}

/**
 * Cascading İl (province) + İlçe (district) pickers, both built on the shared
 * `SearchableSelect` so they match the design-system `Select` and get the same
 * Turkish-correct search. Selecting a city resets the district; the district
 * picker is disabled until a city is chosen.
 */
export default function CityDistrictSelector({
  city,
  district,
  onCityChange,
  onDistrictChange,
  cityPlaceholder,
  districtPlaceholder,
  className = "",
}: CityDistrictSelectorProps) {
  const t = useTranslations();

  const cityOptions = useMemo(
    () => getCityNames().map((c) => ({ value: c, label: c })),
    [],
  );
  const districtOptions = useMemo(
    () =>
      city
        ? getDistrictsForCity(city).map((d) => ({ value: d, label: d }))
        : [],
    [city],
  );

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <SearchableSelect
        value={city}
        onChange={(next) => {
          onCityChange(next);
          onDistrictChange("");
        }}
        options={cityOptions}
        placeholder={cityPlaceholder || t("common.selectCity")}
        searchPlaceholder={t("common.searchCity")}
        emptyText={t("common.noResults")}
        aria-label={t("common.selectCity")}
      />
      <SearchableSelect
        value={district}
        onChange={onDistrictChange}
        options={districtOptions}
        placeholder={districtPlaceholder || t("common.selectDistrict")}
        searchPlaceholder={t("common.searchDistrict")}
        emptyText={t("common.noResults")}
        disabled={!city}
        aria-label={t("common.selectDistrict")}
      />
    </div>
  );
}
