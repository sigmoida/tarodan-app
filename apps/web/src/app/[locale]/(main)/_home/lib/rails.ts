/**
 * The home product rails: ONE definition of what each rail asks the API for,
 * read by the server fetch (`data.ts`) and by the client fallback
 * (`_hooks/useHomeRail.ts`) so both load the same list. Isomorphic: no
 * server-only or client-only imports.
 */

import { hasRealDiscount } from "@/lib/productPrice";
import type { Product } from "@/types/product";

export const HOME_RAILS = [
  "featured",
  "trade",
  "discounted",
  "popular",
] as const;
export type HomeRail = (typeof HOME_RAILS)[number];

/**
 * A rail's server seed: the products, or `null` when the server fetch failed
 * and the rail loads itself in the browser. `[]` is a real empty answer.
 */
export type HomeRailSeed = Product[] | null;

export const POPULAR_PATH = "/products/popular";

type RailQuery = {
  path: "/products" | typeof POPULAR_PATH;
  params: Record<string, string | number | boolean>;
};

export const HOME_RAIL_QUERIES = {
  // Showcase: listings with the "home showcase" boost, latest purchase first.
  featured: {
    path: "/products",
    params: { limit: 20, page: 1, homeShowcase: true, status: "active" },
  },
  trade: {
    path: "/products",
    params: { limit: 24, page: 1, tradeOnly: true, status: "active" },
  },
  discounted: {
    path: "/products",
    params: { limit: 24, page: 1, discountOnly: true, status: "active" },
  },
  popular: { path: POPULAR_PATH, params: { limit: 20, page: 1 } },
} as const satisfies Record<HomeRail, RailQuery>;

/** What a rail shows from the API answer; on-sale keeps real discounts only. */
export function railItems(rail: HomeRail, products: Product[]): Product[] {
  return rail === "discounted" ? products.filter(hasRealDiscount) : products;
}
