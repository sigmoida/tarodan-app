/**
 * Display labels of the listings filter values, shared by the active-filter
 * chips on `/listings` and the saved-search cards, so a filter reads the
 * same wherever it is shown. Pure (no React).
 */
import { formatPrice } from "@/lib/format";
import type { Translate } from "@/types/i18n";

/** A catalog colour option (`GET /products/filters` `colors`). */
export interface ColorOption {
  slug: string;
  label: string;
}

/** The material slug's label, or the slug itself when it is not known. */
export function materialLabel(slug: string, t: Translate): string {
  const labels: Record<string, string> = {
    diecast: t("page.listings.listingstoolbar.diecastMetal"),
    resin: t("page.listings.listingstoolbar.resinRecine"),
    composite: t("page.listings.listingstoolbar.composite"),
    plastic: t("page.listings.listingstoolbar.plastic"),
  };
  return labels[slug] || slug;
}

/** The colour slug's catalog label, or the slug while the catalog loads. */
export function colorLabel(
  slug: string,
  options: readonly ColorOption[] | undefined,
): string {
  return options?.find((option) => option.slug === slug)?.label ?? slug;
}

const isSet = (value: string | number | undefined): value is string | number =>
  value !== undefined && value !== "";

/** The price range chip, money through `formatPrice` (an open top reads ∞). */
export function priceRangeLabel(
  min: string | number | undefined,
  max: string | number | undefined,
): string {
  return `${formatPrice(isSet(min) ? min : 0)} - ${isSet(max) ? formatPrice(max) : "∞"}`;
}
