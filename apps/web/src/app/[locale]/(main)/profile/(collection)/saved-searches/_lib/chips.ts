import type { SavedSearch } from "@tarodan/types";
import { formatCondition } from "@/lib/format";
import type { Translate } from "@/types/i18n";
import {
  colorLabel,
  materialLabel,
  priceRangeLabel,
  type ColorOption,
} from "@/lib/listingFilterLabels";

/**
 * The summary chips of a saved search, read from its canonical `query` and the
 * display-name `labels` snapshot (ids never reach the user). Values read as
 * the `/listings` filter chips do (`lib/listingFilterLabels`), flags reuse its copy.
 * `colorOptions` is the listings filter catalog; a slug shows until it loads.
 */
export function savedSearchChips(
  { query, labels }: Pick<SavedSearch, "query" | "labels">,
  t: Translate,
  locale: string,
  colorOptions?: readonly ColorOption[],
): string[] {
  const chips: string[] = [];
  if (query.search) chips.push(`${t("common.search")}: "${query.search}"`);

  const named = [
    query.categoryId && labels.categoryId,
    (query.brandId && labels.brandId) || query.brand,
    (query.manufacturerId && labels.manufacturerId) || query.manufacturer,
    query.carModelId && labels.carModelId,
    query.scale,
    query.material && materialLabel(query.material, t),
  ];
  for (const name of named) if (name) chips.push(name);

  if (query.condition) chips.push(formatCondition(query.condition, locale));
  if (query.color) {
    for (const slug of query.color.split(",")) {
      chips.push(colorLabel(slug, colorOptions));
    }
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    chips.push(priceRangeLabel(query.minPrice, query.maxPrice));
  }
  if (query.tradeOnly) chips.push(t("product.tradeAvailable"));
  if (query.discountOnly) chips.push(t("product.onSale"));
  if (query.preOrder) chips.push(t("product.preOrder"));
  if (query.limited) chips.push(t("product.limitedEdition"));
  if (query.set) chips.push(t("product.sets"));
  return chips;
}
