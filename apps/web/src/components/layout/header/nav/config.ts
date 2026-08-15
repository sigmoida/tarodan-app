/** @format */

import type { Translate } from "@/types/i18n";

export type NavDropdown = "categories" | "scales";

export interface NavBarItem {
  label: string;
  href?: string;
  dropdown?: NavDropdown;
}

/**
 * Katalog gezinme çubuğu — etiketler paylaşılan katalogdan gelir, bu yüzden yeni
 * bir dil eklemek burada değişiklik gerektirmez (eskiden liste locale başına elle
 * yazılıyordu ve üçüncü dil sessizce eksik kalırdı).
 */
export function categoryBarItems(t: Translate): NavBarItem[] {
  return [
    { label: t("nav.allListings"), href: "/listings" },
    { label: t("nav.newArrivals"), href: "/listings?sortBy=created_desc" },
    { label: t("nav.bestSellers"), href: "/listings?sortBy=view_count_desc" },
    { label: t("nav.onSale"), href: "/listings?discountOnly=true" },
    { label: t("nav.collections"), href: "/collections" },
    { label: t("nav.manufacturers"), href: "/manufacturers" },
    { label: t("nav.categories"), dropdown: "categories" },
    { label: t("nav.scale"), dropdown: "scales" },
  ];
}

export interface ManufacturerRef {
  id: string;
  name: string;
}

/**
 * Katalog gezinme adresleri — TEK kaynak.
 *
 * Aynı hedefler masaüstü mega-panelinde ve mobil çekmecede kullanılıyor; adresi
 * iki yerde elle kurmak, birinin filtre parametresi değiştiğinde diğerinin
 * sessizce yanlış sayfaya götürmesi anlamına gelirdi.
 */
export const navHref = {
  vehicleType: (slug: string) =>
    `/listings?category=${encodeURIComponent(slug)}`,
  manufacturer: (manufacturer: ManufacturerRef) =>
    `/listings?manufacturer=${encodeURIComponent(manufacturer.name)}&manufacturerId=${encodeURIComponent(manufacturer.id)}`,
  scale: (scale: string) => `/listings?scale=${encodeURIComponent(scale)}`,
  allManufacturers: "/manufacturers",
} as const;

interface ManufacturerGroup {
  range: string;
  items: ManufacturerRef[];
}

const RANGES: Array<{ range: string; min: string; max: string }> = [
  { range: "A-E", min: "A", max: "E" },
  { range: "F-M", min: "F", max: "M" },
  { range: "N-S", min: "N", max: "S" },
  { range: "T-Z", min: "T", max: "Z" },
];

/** Bucket manufacturers into alphabetical ranges, sorted, dropping empties. */
export function groupManufacturers(
  manufacturers: ManufacturerRef[],
): ManufacturerGroup[] {
  const groups: ManufacturerGroup[] = RANGES.map((r) => ({
    range: r.range,
    items: [],
  }));

  for (const mfr of manufacturers) {
    const first = mfr.name.charAt(0).toUpperCase();
    const idx = RANGES.findIndex((r) => first >= r.min && first <= r.max);
    if (idx >= 0) groups[idx].items.push({ id: mfr.id, name: mfr.name });
  }

  return groups
    .map((g) => ({
      range: g.range,
      items: g.items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);
}
