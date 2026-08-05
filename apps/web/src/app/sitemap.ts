import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { getServerApiOrigin } from "@/lib/api/origin";

/**
 * hreflang alternates for one path, in the sitemap's Google-preferred form.
 * With `localePrefix: 'as-needed'` (#214) the default `tr` URL is prefix-free
 * and English lives under `/en`. `x-default` points at the tr URL. Emitting
 * these as `<xhtml:link rel="alternate">` per entry tells crawlers the two
 * language variants are the same page (complements the `Link` hreflang headers
 * the next-intl middleware already sets on every response).
 */
function localeAlternates(path: string) {
  return {
    languages: {
      tr: `${SITE_URL}${path}`,
      en: `${SITE_URL}/en${path}`,
      "x-default": `${SITE_URL}${path}`,
    },
  };
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
];

/** Best-effort: append active listing detail URLs. Never throws — a failed or
 *  slow API just yields the static sitemap so the route always resolves. */
async function fetchListingUrls(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(
      `${API_BASE}/api/products?limit=1000&status=active`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const raw = await res.json();
    const items: any[] = Array.isArray(raw)
      ? raw
      : (raw?.data ?? raw?.products ?? []);
    return items
      .filter((p) => p?.id)
      .map((p) => ({
        url: `${SITE_URL}/listings/${p.id}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : undefined,
        changeFrequency: "daily" as const,
        priority: 0.7,
        alternates: localeAlternates(`/listings/${p.id}`),
      }));
  } catch {
    return [];
  }
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
