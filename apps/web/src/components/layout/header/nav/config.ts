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
  /** Aktif ilan sayısı — `/manufacturers` yanıtı bunu bu biçimde döndürür. */
  _count?: { products: number };
}

/** Bir üreticinin aktif ilan sayısı; sayaç gelmediyse 0. */
export function manufacturerListingCount(m: ManufacturerRef): number {
  return m._count?.products ?? 0;
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

/**
 * Gezinmede gösterilen en fazla üretici sayısı. Katalogda yüzlerce üretici var;
 * hepsini basmak masaüstü mega-panelini ekranın altına taşırıyor (kalanı
 * tıklanamıyordu), mobil çekmeceyi de yüzlerce satırlık bir listeye çeviriyordu.
 * Menü bir "en popülerler" vitrini; tam liste `/manufacturers` sayfasında.
 */
export const NAV_MANUFACTURER_LIMIT = 40;

/**
 * Menüde gösterilecek üreticiler: önce İLANI OLANLAR, ilan sayısına göre azalan
 * sırada ilk `limit` tanesi.
 *
 * Sayaç hiç gelmemişse (eski/başka bir yanıt biçimi) süzme yapılmaz — aksi
 * halde tek bir alan değişikliği menüyü sessizce boşaltırdı. Sayaçlar gelmiş ve
 * hepsi sıfırsa liste gerçekten boştur; olmayan seçeneği menüde reklam etmeyiz.
 */
function popularManufacturers(
  manufacturers: ManufacturerRef[],
  limit: number,
): ManufacturerRef[] {
  const hasCounts = manufacturers.some((m) => m._count?.products != null);
  const pool = hasCounts
    ? manufacturers.filter((m) => manufacturerListingCount(m) > 0)
    : manufacturers;

  return [...pool]
    .sort(
      (a, b) =>
        manufacturerListingCount(b) - manufacturerListingCount(a) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** Bucket manufacturers into alphabetical ranges, sorted, dropping empties. */
export function groupManufacturers(
  manufacturers: ManufacturerRef[],
  limit: number = NAV_MANUFACTURER_LIMIT,
): ManufacturerGroup[] {
  const groups: ManufacturerGroup[] = RANGES.map((r) => ({
    range: r.range,
    items: [],
  }));

  for (const mfr of popularManufacturers(manufacturers, limit)) {
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
