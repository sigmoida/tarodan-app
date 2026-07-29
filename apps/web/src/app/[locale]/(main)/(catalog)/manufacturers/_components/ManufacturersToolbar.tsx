/** @format */

"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Input, Select } from "@tarodan/ui";
import { useManufacturers } from "../_context/ManufacturersContext";

export default function ManufacturersToolbar() {
  const {
    searchQuery,
    setSearchQuery,
    selectedCountry,
    setSelectedCountry,
    countries,
  } = useManufacturers();

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      {/* Search */}
      <div className="relative flex-1">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle z-10" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Üretici ara..."
          className="w-full pl-9 pr-4 rounded"
        />
      </div>

      {/* Country filter */}
      <Select
        value={selectedCountry ?? ""}
        onChange={(e) => setSelectedCountry(e.target.value || null)}
        className="w-full sm:w-56"
      >
        <option value="">Tüm ülkeler</option>
        {countries.map(([country, info]) => (
          <option key={country} value={country}>
            {info.flag} {country}
          </option>
        ))}
      </Select>
    </div>
  );
}
