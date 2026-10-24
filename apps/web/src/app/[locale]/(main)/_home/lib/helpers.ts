import {
  manufacturersWithListings,
  type ManufacturerRef,
} from "@/components/layout/header/nav/config";
import { PRODUCT_PLACEHOLDER } from "@/lib/productPlaceholder";
import type { BrandMarqueeItem } from "./types";

export const getImageUrl = (
  image: any,
  _index?: number,
  _productTitle?: string,
): string => {
  const raw =
    typeof image === "string"
      ? image
      : image?.cardUrl || image?.detailUrl || image?.url;

  if (typeof raw !== "string") return PRODUCT_PLACEHOLDER;
  return /^(https?:\/\/|\/|data:|blob:)/.test(raw) ? raw : PRODUCT_PLACEHOLDER;
};

/** `/api/manufacturers` satırı — marka şeridi için gereken alanlar. */
export interface MarqueeManufacturer extends ManufacturerRef {
  logo?: string | null;
  description?: string | null;
}

/**
 * Marka şeridi öğeleri: gezinme menüsüyle aynı kural — ilanı olmayan üreticiler
 * gizlenir (`manufacturersWithListings`).
 */
export function toMarqueeItems(
  manufacturers: MarqueeManufacturer[],
): BrandMarqueeItem[] {
  return manufacturersWithListings(manufacturers).map((item) => ({
    id: item.id,
    name: item.name,
    logoUrl: item.logo || "",
    desc: item.description || "",
  }));
}
