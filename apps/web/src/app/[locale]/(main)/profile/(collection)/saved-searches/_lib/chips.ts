import type { SavedSearch } from "@tarodan/types";
import { formatCondition } from "@/lib/format";
import type { Translate } from "@/types/i18n";

/**
 * The summary chips of a saved search, read from its canonical `query` and the
 * display-name `labels` snapshot (ids never reach the user). Flag labels reuse
 * the listings filter copy.
 */
export function savedSearchChips(
  { query, labels }: Pick<SavedSearch, "query" | "labels">,
  t: Translate,
  locale: string,
): string[] {
  const chips: string[] = [];
  if (query.search) chips.push(`${t("common.search")}: "${query.search}"`);

  const named = [
    query.categoryId && labels.categoryId,
    (query.brandId && labels.brandId) || query.brand,
    (query.manufacturerId && labels.manufacturerId) || query.manufacturer,
    query.carModelId && labels.carModelId,
    query.scale,
    query.material,
  ];
  for (const name of named) if (name) chips.push(name);

  if (query.condition) chips.push(formatCondition(query.condition, locale));
  if (query.color) chips.push(...query.color.split(","));
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    chips.push(`₺${query.minPrice ?? 0} - ₺${query.maxPrice ?? "∞"}`);
  }
  if (query.tradeOnly) chips.push(t("product.tradeAvailable"));
  if (query.discountOnly) chips.push(t("product.onSale"));
  if (query.preOrder) chips.push(t("product.preOrder"));
  if (query.limited) chips.push(t("product.limitedEdition"));
  if (query.set) chips.push(t("product.sets"));
  return chips;
}
