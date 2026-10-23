/**
 * Server data for the home page (`[locale]/(main)/page.tsx`).
 *
 * The page is ISR (prerendered per locale, refreshed every
 * `HOME_REVALIDATE_SECONDS` or on demand through the `products:list` tag). The
 * page never throws on a failed fetch: an on-demand tag revalidation renders
 * it blocking with no stale copy to fall back on, so a throw would answer 500.
 * Instead a product rail whose fetch still fails after one retry gets a `null`
 * seed and loads itself in the browser (`HomeRailSection`). This also covers
 * `next build` without API access (offline Docker build). The other sections
 * are optional and fall back to empty.
 */

import { MANUFACTURERS_WITH_LISTINGS_PATH } from "@/lib/api/catalog";
import { fetchHeroSlides, fetchTrustBadges } from "@/lib/api/hero";
import { getServerApiOrigin } from "@/lib/api/origin";
import { unwrapList } from "@/lib/unwrapList";
import type { Product } from "@/types/product";
import { toMarqueeItems, type MarqueeManufacturer } from "./helpers";
import {
  HOME_RAILS,
  HOME_RAIL_QUERIES,
  railItems,
  type HomeRail,
  type HomeRailSeed,
} from "./rails";
import type {
  FeaturedBusiness,
  FeaturedCollector,
  HomePageData,
} from "./types";

/** ISR window of every home fetch; on-demand tags refresh sooner. */
export const HOME_REVALIDATE_SECONDS = 60;
/** Per-attempt budget of a product rail fetch (two attempts at most). */
export const HOME_RAIL_TIMEOUT_MS = 4000;
/**
 * Pause before the single retry. While Next revalidates a stale fetch entry it
 * shares the in-flight origin request with any identical fetch until that
 * response body is read, so an immediate retry would get the same failure
 * back instead of asking the API again.
 */
export const HOME_RAIL_RETRY_DELAY_MS = 300;
/**
 * Tag the API revalidates (`POST /api/revalidate`) when listing visibility or
 * order changes: price, discount, boost, expiry.
 */
export const PRODUCTS_LIST_TAG = "products:list";

type QueryParams = Record<string, string | number | boolean>;

/** A non-2xx answer from the API; `status` decides whether to retry. */
export class RailHttpError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`${path} responded ${status}`);
    this.name = "RailHttpError";
  }
}

/** Network failure, timeout or 5xx: worth one more try. A 4xx is final. */
function isRetryable(error: unknown): boolean {
  return !(error instanceof RailHttpError) || error.status >= 500;
}

async function fetchRailOnce(path: string, url: string): Promise<Product[]> {
  const res = await fetch(url, {
    next: { revalidate: HOME_REVALIDATE_SECONDS, tags: [PRODUCTS_LIST_TAG] },
    // Next drops the signal while it revalidates a stale entry in the
    // background; that render does not block a visitor.
    signal: AbortSignal.timeout(HOME_RAIL_TIMEOUT_MS),
  });
  if (!res.ok) throw new RailHttpError(path, res.status);
  // The API answers a bare array or a `{ data | products }` envelope.
  return unwrapList<Product>(await res.json());
}

/**
 * One product rail fetch. Only a 200 is stored in the Next data cache, so a
 * failure is never cached; it is retried once after a short pause on a
 * network error, timeout or 5xx and thrown after that.
 */
export async function fetchProductRail(
  path: string,
  params: QueryParams,
): Promise<Product[]> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${getServerApiOrigin()}/api${path}?${qs}`;
  try {
    return await fetchRailOnce(path, url);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await new Promise((resolve) =>
      setTimeout(resolve, HOME_RAIL_RETRY_DELAY_MS),
    );
    return fetchRailOnce(path, url);
  }
}

async function fetchRail(rail: HomeRail): Promise<Product[]> {
  const { path, params } = HOME_RAIL_QUERIES[rail];
  return railItems(rail, await fetchProductRail(path, params));
}

/**
 * Turn the settled rail fetches into seeds: the products, or `null` (logged)
 * when the fetch failed, so the rail loads client-side instead of claiming to
 * be empty.
 */
export function resolveHomeRails(
  results: Record<HomeRail, PromiseSettledResult<Product[]>>,
): Record<HomeRail, HomeRailSeed> {
  const seeds = {} as Record<HomeRail, HomeRailSeed>;
  for (const rail of HOME_RAILS) {
    const result = results[rail];
    if (result.status === "fulfilled") {
      seeds[rail] = result.value;
    } else {
      // Web Sentry is off in production; the server log is the trace.
      console.error(`[home] ${rail} rail failed`, result.reason);
      seeds[rail] = null;
    }
  }
  return seeds;
}

async function settleRails(): Promise<
  Record<HomeRail, PromiseSettledResult<Product[]>>
> {
  const settled = await Promise.allSettled(HOME_RAILS.map(fetchRail));
  return Object.fromEntries(
    HOME_RAILS.map((rail, i) => [rail, settled[i]]),
  ) as Record<HomeRail, PromiseSettledResult<Product[]>>;
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${getServerApiOrigin()}/api${path}`, {
    next: { revalidate: HOME_REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

/** Brand strip: only manufacturers with active listings (API `hasListings`). */
async function fetchManufacturers(): Promise<MarqueeManufacturer[]> {
  return unwrapList<MarqueeManufacturer>(
    await fetchJson(MANUFACTURERS_WITH_LISTINGS_PATH),
  );
}

async function fetchTopCollections(): Promise<FeaturedCollector[]> {
  return unwrapList<FeaturedCollector>(
    await fetchJson("/users/top-collections?limit=20"),
  );
}

/** featured-collector / featured-business: mirror the client's `data ?? null`. */
async function fetchNullable<T>(path: string): Promise<T | null> {
  return ((await fetchJson(path)) ?? null) as T | null;
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

/** Everything the home page renders. Never throws. */
export async function loadHomePageData(): Promise<HomePageData> {
  const [
    railResults,
    [
      manufacturers,
      featuredCollector,
      featuredBusiness,
      topCollections,
      heroSlides,
      trustBadges,
    ],
  ] = await Promise.all([
    settleRails(),
    Promise.allSettled([
      fetchManufacturers(),
      fetchNullable<FeaturedCollector>("/users/featured-collector"),
      fetchNullable<FeaturedBusiness>("/users/featured-business"),
      fetchTopCollections(),
      // Admin-managed hero and trust badges; on error or empty the section is
      // not drawn.
      fetchHeroSlides("home"),
      fetchTrustBadges(),
    ]),
  ]);

  return {
    ...resolveHomeRails(railResults),
    // Brand strip comes from the API only; logos are absolute S3 URLs.
    marqueeItems: toMarqueeItems(settledValue(manufacturers, [])),
    topCollections: settledValue(topCollections, []),
    featuredCollector: settledValue(featuredCollector, null),
    featuredBusiness: settledValue(featuredBusiness, null),
    heroSlides: settledValue(heroSlides, []),
    trustBadges: settledValue(trustBadges, []),
  };
}
