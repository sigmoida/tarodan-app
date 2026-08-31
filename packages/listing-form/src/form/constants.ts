/** @format */

// Shared constants + types for the new/edit listing forms.

import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";
import type { Translate } from "./translate";

export interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export interface CarModel {
  id: string;
  name: string;
  slug: string;
  brand: { slug: string };
}

export interface Ref {
  id: string;
  name: string;
  slug: string;
}

export const getConditions = (locale: string) => {
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  return [
    { value: "new", label: t("common.new") },
    { value: "like_new", label: t("product.conditionLikeNew") },
    { value: "very_good", label: t("product.conditionVeryGood") },
    { value: "good", label: t("product.conditionGood") },
    { value: "fair", label: t("product.conditionFair") },
  ];
};

export const getYearOptions = (): number[] => {
  const currentYear = new Date().getFullYear();
  return Array.from(
    { length: currentYear - 1950 + 1 },
    (_, i) => currentYear - i,
  );
};

/**
 * İlan başına en fazla renk. Sunucudaki `MAX_PRODUCT_COLORS` ile aynı olmalı —
 * fazlası API'de 400 döner.
 */
export const MAX_LISTING_COLORS = 3;

/**
 * Global (üreticiden bağımsız) attribute gruplarının slug'ları — sunucudaki
 * `common/helpers/attribute-groups.ts` ile aynı olmalı; kayıttaki nitelikler
 * bunlarla kendi alanlarına ayrıştırılır.
 *
 * Grubun ADI ("Ölçek", "Renk") değil slug'ı kullanılır: ad kataloğa bağlıdır,
 * slug değildir.
 */
export const SCALE_GROUP_SLUG = "scale";
export const MATERIAL_GROUP_SLUG = "material";
export const COLOR_GROUP_SLUG = "color";

/**
 * Birden çok rengin tek satırda birleştirilme ayracı — sunucudaki
 * `COLOR_LABEL_SEPARATOR` ile aynı olmalı ki `products.color` kolonundan gelen
 * metin ile istemcide türetilen metin birbirinin aynısı olsun.
 */
export const COLOR_LABEL_SEPARATOR = ", ";

/** Renk seçeneği: katalogdaki "color" attribute grubundan gelir. */
export interface ColorOption {
  slug: string;
  label: string;
  color?: string | null;
}

// Brand/scale categories have their own dedicated fields, so they are dropped
// from the category picker (opt-in via useListingCategories).
export const EXCLUDED_BRAND_SLUGS = new Set([
  "hot-wheels",
  "hot-wheels-premium",
  "hot-wheels-rlc",
  "matchbox",
  "tomica",
  "tomica-limited-vintage",
  "majorette",
  "m2-machines",
  "greenlight",
  "johnny-lightning",
]);

export const EXCLUDED_SCALE_SLUGS = new Set([
  "scale-118",
  "scale-124",
  "scale-143",
  "scale-164",
]);
