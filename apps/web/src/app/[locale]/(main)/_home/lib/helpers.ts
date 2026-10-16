import {
  manufacturersWithListings,
  type ManufacturerRef,
} from "@/components/layout/header/nav/config";
import type { BrandMarqueeItem } from "./types";

/**
 * Faz 1/2: görselsiz ürün için YEREL placeholder — harici placeholder
 * servisleri (placehold.co/picsum) tamamen kaldırıldı; gerçek görseller
 * her zaman API'nin verdiği mutlak URL'den (S3/CDN) gelir.
 */
const PRODUCT_PLACEHOLDER = "/product-placeholder.svg";

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
