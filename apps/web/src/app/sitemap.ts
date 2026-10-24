import { MetadataRoute } from "next";
import { listingPath } from "@tarodan/types";
import { SITE_URL, localeLanguages } from "@/lib/seo";
import { getServerApiOrigin } from "@/lib/api/origin";

/**
 * hreflang alternates for one path, in the sitemap's Google-preferred form.
 * With `localePrefix: 'as-needed'` (#214) the default `tr` URL is prefix-free
 * and English lives under `/en`. `x-default` points at the tr URL. Emitting
 * these as `<xhtml:link rel="alternate">` per entry tells crawlers the two
 * language variants are the same page (complements the `Link` hreflang headers
 * the next-intl middleware already sets on every response). The set comes from
 * `localeLanguages`, the same one the page heads use, made absolute here.
 */
function localeAlternates(path: string) {
  const languages: Record<string, string> = {};
  for (const [lang, href] of Object.entries(localeLanguages(path))) {
    languages[lang] = `${SITE_URL}${href}`;
  }
  return { languages };
}

// Server-side API origin (same resolution the listings route uses).
const API_BASE = getServerApiOrigin();

// Public, indexable static routes (private/app routes are excluded — see robots.ts).
const STATIC_PATHS = [
  "",
  "/listings",
  "/collections",
  "/manufacturers",
  "/membership",
  // corporate
  "/about",
  "/contact",
  "/newsletter",
  // shopping
  "/sell",
  "/payment-options",
  "/platform-service-fee",
  "/shipping-delivery",
  // support
  "/support",
  "/faq",
  "/guides",
  // trust
  "/secure-swap",
  "/buyer-protection",
  "/authenticity",
  "/security-features",
  // legal
  "/terms",
  "/privacy",
  "/distance-sales",
  "/cookies",
  "/refund-policy",
  "/seller-agreement",
  "/intellectual-property",
  "/account-deletion",
];

/**
 * Page size for the listing pages: the API's cap on `GET /products`
 * (`ProductQueryDto.limit` is `@Max(100)`). Asking for more is a 400, which
 * once left the sitemap with no listings at all.
 */
const LISTING_PAGE_SIZE = 100;

/**
 * Most listing pages one sitemap build reads (50 x 100 = 5,000 listings, well
 * under the 50,000 URLs a sitemap file may hold). Keeps the hourly build
 * bounded if the catalogue grows; past it, a sitemap index is the next step.
 */
const MAX_LISTING_PAGES = 50;

/** A listing as the list endpoint sends it; untrusted, checked per field. */
interface SitemapListing {
  id?: unknown;
  title?: unknown;
  updatedAt?: unknown;
}

interface ListingPage {
  items: SitemapListing[];
  totalPages: number;
}

/**
 * One page of active listings, newest first: a fixed order, so the pages do
 * not shift under the build the way the default relevance order would (it
 * moves with views and boosts). Null when the page could not be read.
 */
async function fetchListingPage(page: number): Promise<ListingPage | null> {
  try {
    const query = new URLSearchParams({
      status: "active",
      sortBy: "created_desc",
      limit: String(LISTING_PAGE_SIZE),
      page: String(page),
    });
    const res = await fetch(`${API_BASE}/api/products?${query}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const raw = await res.json();
    const list: unknown = Array.isArray(raw)
      ? raw
      : (raw?.data ?? raw?.products);
    const items: SitemapListing[] = Array.isArray(list) ? list : [];
    const totalPages = Number(raw?.meta?.totalPages);
    return {
      items,
      totalPages:
        Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort: the active listings' canonical URLs (`/listings/<slug>-<uuid>`,
 * ADR 0017). Never throws: a failed or slow API yields fewer (or no) listing
 * entries, so the route always resolves. Page 1 tells how many pages there
 * are; the rest are read in parallel, and a page that fails is skipped.
 */
async function fetchListingUrls(): Promise<MetadataRoute.Sitemap> {
  const first = await fetchListingPage(1);
  if (!first) return [];
  const pageCount = Math.min(first.totalPages, MAX_LISTING_PAGES);
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, i) => fetchListingPage(i + 2)),
  );

  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  for (const page of [first, ...rest]) {
    for (const listing of page?.items ?? []) {
      const id = listing?.id;
      // A listing created mid-build shifts the pages by one: skip the repeat.
      if (typeof id !== "string" || seen.has(id)) continue;
      seen.add(id);
      const title = typeof listing.title === "string" ? listing.title : null;
      const path = listingPath({ id, title });
      const updatedAt =
        typeof listing.updatedAt === "string"
          ? new Date(listing.updatedAt)
          : null;
      entries.push({
        url: `${SITE_URL}${path}`,
        lastModified:
          updatedAt && !Number.isNaN(updatedAt.getTime())
            ? updatedAt
            : undefined,
        changeFrequency: "daily",
        priority: 0.7,
        alternates: localeAlternates(path),
      });
    }
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: p === "" || p === "/listings" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.6,
    alternates: localeAlternates(p),
  }));
  const listingEntries = await fetchListingUrls();
  return [...staticEntries, ...listingEntries];
}
