import { generateSlug } from "@tarodan/types";

/**
 * Car model slug = brand slug + model name (`dodge-charger`).
 *
 * `CarModel.slug` is `@unique`, so this derivation is the de facto uniqueness
 * guarantee standing in for the `@@unique([brandId, name])` constraint the
 * schema does not have: manual entry, import and seed must use this one body.
 * The slug rule itself (`generateSlug`, Turkish transliteration) lives in
 * `@tarodan/types` so catalog and listing slugs share one implementation.
 */
export function carModelSlug(brandSlug: string, name: string): string {
  return generateSlug(`${brandSlug}-${name}`);
}
