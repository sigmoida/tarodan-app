"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { getCityNames, getDistrictsForCity } from "@/lib/turkeyLocations";
import { useLocale, useTranslations } from "next-intl";
import { Button, Input } from "@tarodan/ui";

interface CityDistrictSelectorProps {
  city: string;
  district: string;
  onCityChange: (city: string) => void;
  onDistrictChange: (district: string) => void;
  cityPlaceholder?: string;
  districtPlaceholder?: string;
  className?: string;
}

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
  const [cityOpen, setCityOpen] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  // Sayfanın altındayken (ör. takas adres formu) dropdown aşağı açılınca sabit çerez
  // banner'ının/ekran sınırının arkasında kalıp tıklanamıyordu. Altta yer yoksa yukarı aç.
  const [cityUp, setCityUp] = useState(false);
  const [districtUp, setDistrictUp] = useState(false);

  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const districtDropdownRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);

  const cities = getCityNames();
  const districts = city ? getDistrictsForCity(city) : [];

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("🔄 City prop changed to:", city);
    }
  }, [city]);

  // Turkish character normalization for search
  const normalizeForSearch = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/İ/g, "i")
      .replace(/ğ/g, "g")
      .replace(/Ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/Ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/Ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/Ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/Ç/g, "c");
  };

  const filteredCities = citySearch.trim()
    ? cities.filter((c) =>
        normalizeForSearch(c).includes(normalizeForSearch(citySearch)),
      )
    : cities;

  const filteredDistricts = districtSearch.trim()
    ? districts.filter((d) =>
        normalizeForSearch(d).includes(normalizeForSearch(districtSearch)),
      )
    : districts;

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          "📍 handleClickOutside triggered, isSelectingRef:",
          isSelectingRef.current,
        );
      }
      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        return;
      }
      const cityContains = cityDropdownRef.current?.contains(
        event.target as Node,
      );
      const districtContains = districtDropdownRef.current?.contains(
        event.target as Node,
      );
      if (cityDropdownRef.current && !cityContains) {
        setCityOpen(false);
        setCitySearch("");
      }
      if (districtDropdownRef.current && !districtContains) {
        setDistrictOpen(false);
        setDistrictSearch("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Dropdown ~280px yüksekliğinde; toggle'ın altında o kadar yer yoksa yukarı açılsın.
  const shouldOpenUp = (wrapper: HTMLElement | null): boolean => {
    if (!wrapper || typeof window === "undefined") return false;
    const rect = wrapper.getBoundingClientRect();
    return window.innerHeight - rect.bottom < 300;
  };

  const selectCity = useCallback(
    (selectedCity: string) => {
      if (process.env.NODE_ENV === "development") {
        console.log(
          "🏙️ selectCity called with:",
          selectedCity,
          "current city:",
          city,
        );
      }
      isSelectingRef.current = true;
      onCityChange(selectedCity);
      onDistrictChange("");
      setCityOpen(false);
      setCitySearch("");
    },
    [onCityChange, onDistrictChange, city],
  );

  const selectDistrict = useCallback(
    (selectedDistrict: string) => {
      if (process.env.NODE_ENV === "development") {
        console.log("🏘️ selectDistrict called with:", selectedDistrict);
      }
      isSelectingRef.current = true;
      onDistrictChange(selectedDistrict);
      setDistrictOpen(false);
      setDistrictSearch("");
    },
    [onDistrictChange],
  );

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {/* City Dropdown */}
      <div ref={cityDropdownRef} className="relative">
        <Button
          variant="secondary"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!cityOpen) setCityUp(shouldOpenUp(cityDropdownRef.current));
            setCityOpen(!cityOpen);
            setDistrictOpen(false);
          }}
          className={`w-full px-4 py-3 text-left bg-surface-elevated border rounded-xl flex items-center justify-between transition-all ${
            cityOpen
              ? "border-primary-500 ring-2 ring-primary-100"
              : "border-border hover:border-border"
          } ${!city ? "text-subtle" : "text-heading"}`}
        >
          <span className="truncate">
            {city || cityPlaceholder || t("common.selectCity")}
          </span>
          <ChevronDownIcon
            className={`w-5 h-5 text-subtle transition-transform ${cityOpen ? "rotate-180" : ""}`}
          />
        </Button>

        {cityOpen && (
          <div
            className={`absolute z-[9999] w-full bg-surface-elevated border border-border rounded-xl shadow-xl overflow-hidden ${cityUp ? "bottom-full mb-1" : "top-full mt-1"}`}
            style={{ maxHeight: "280px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-border-subtle bg-surface-elevated sticky top-0">
              <Input
                type="text"
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder={t("common.searchCity")}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary-500"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <ul className="overflow-y-auto" style={{ maxHeight: "220px" }}>
              {filteredCities.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted text-center">
                  {t("common.noResults")}
                </li>
              ) : (
                filteredCities.map((c) => (
                  <li
                    key={c}
                    onClick={(e) => {
                      if (process.env.NODE_ENV === "development") {
                        console.log("🖱️ City item CLICK:", c);
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      selectCity(c);
                    }}
                    onMouseDown={(e) => {
                      if (process.env.NODE_ENV === "development") {
                        console.log("🖱️ City item MOUSEDOWN:", c);
                      }
                      e.stopPropagation();
                    }}
                    className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-primary-50 select-none ${
                      c === city
                        ? "bg-primary-100 text-primary-700 font-medium"
                        : "text-body"
                    }`}
                  >
                    {c}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {/* District Dropdown */}
      <div ref={districtDropdownRef} className="relative">
        <Button
          variant="secondary"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!city) {
              setCityOpen(true);
              return;
            }
            if (!districtOpen)
              setDistrictUp(shouldOpenUp(districtDropdownRef.current));
            setDistrictOpen(!districtOpen);
            setCityOpen(false);
          }}
          disabled={!city}
          className={`w-full px-4 py-3 text-left bg-surface-elevated border rounded-xl flex items-center justify-between transition-all ${
            districtOpen
              ? "border-primary-500 ring-2 ring-primary-100"
              : "border-border hover:border-border"
          } ${!district ? "text-subtle" : "text-heading"} ${!city ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span className="truncate">
            {district || districtPlaceholder || t("common.selectDistrict")}
          </span>
          <ChevronDownIcon
            className={`w-5 h-5 text-subtle transition-transform ${districtOpen ? "rotate-180" : ""}`}
          />
        </Button>

        {districtOpen && city && (
          <div
            className={`absolute z-[9999] w-full bg-surface-elevated border border-border rounded-xl shadow-xl overflow-hidden ${districtUp ? "bottom-full mb-1" : "top-full mt-1"}`}
            style={{ maxHeight: "280px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-border-subtle bg-surface-elevated sticky top-0">
              <Input
                type="text"
                value={districtSearch}
                onChange={(e) => setDistrictSearch(e.target.value)}
                placeholder={t("common.searchDistrict")}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-primary-500"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <ul className="overflow-y-auto" style={{ maxHeight: "220px" }}>
              {filteredDistricts.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted text-center">
                  {t("common.noResults")}
                </li>
              ) : (
                filteredDistricts.map((d) => (
                  <li
                    key={d}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectDistrict(d);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-primary-50 select-none ${
                      d === district
                        ? "bg-primary-100 text-primary-700 font-medium"
                        : "text-body"
                    }`}
                  >
                    {d}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
