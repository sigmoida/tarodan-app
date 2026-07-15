/** @format */

// Shared constants + types for the new/edit listing forms.

import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

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

export const FALLBACK_SCALES = ["1:18", "1:24", "1:43", "1:64", "1:87"];

export const FALLBACK_MATERIALS = [
  { slug: "diecast", label: "Diecast (Metal)" },
  { slug: "resin", label: "Resin (Reçine)" },
  { slug: "composite", label: "Composite (Kompozit)" },
  { slug: "plastic", label: "Plastic (Plastik)" },
];

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
