import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { listingPath, parseListingParam } from "@tarodan/types";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import { getServerApiOrigin } from "@/lib/api/origin";
import { permanentRedirect } from "@/i18n/navigation";
import { localizedAlternates, localizedPath } from "@/lib/seo";
import ListingDetailClient from "./ListingDetailClient";
import ProductStaticInfo from "./_sections/ProductStaticInfo";
import ProductStaticSpecs from "./_sections/ProductStaticSpecs";
import type { Listing } from "./_lib/types";
import {
  canonicalListingPath,
  canonicalRedirectHref,
  type RouteSearchParams,
} from "./_lib/route";
import { formatTL } from "@/lib/format";
import { getTranslations } from "next-intl/server";

const API_BASE = getServerApiOrigin();

/**
 * `[id]` is the URL segment as requested: a bare UUID (old links, push and
 * in-app links, e-mails) or the canonical `<slug>-<uuid>` (ADR 0017). It is
 * parsed with `parseListingParam` before any use; the UUID is the key.
 */
type Props = {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<RouteSearchParams>;
};

interface ProductForMeta {
  title?: string;
  description?: string | null;
  price?: number | string | null;
  images?: Array<{ detailUrl?: string; cardUrl?: string; url?: string }>;
}

/**
 * Public product fetch (no auth). Next memoizes the fetch, so the same URL used
 * by generateMetadata and the page body hits the network once. Returns the
 * product object or null (pending/owner-only products 404 publicly — those fall
 * back to the client fetch, which carries the user's cookies).
 */
async function fetchProduct(id: string): Promise<Listing | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/products/${encodeURIComponent(id)}`,
      {
        // Tagged so the backend can on-demand revalidate this product's page when
        // its price/discount changes (see app/api/revalidate); revalidate = fallback.
        next: { revalidate: 60, tags: [`product:${id}`] },
      },
    );
    if (!res.ok) return null;
    const raw = await res.json();
    return (raw?.product ?? raw) as Listing;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations();
  const { id: segment, locale } = await params;
  const id = parseListingParam(segment);
  const product = id
    ? ((await fetchProduct(id)) as ProductForMeta | null)
    : null;
  if (!id || !product?.title)
    return { title: t("page.listings.page.ilanBulunamadiTarodan") };

  const priceNum = Number(product.price);
  const priceText = Number.isFinite(priceNum) ? ` - ${formatTL(priceNum)}` : "";
  const title = `${product.title}${priceText} | Tarodan`;
  const description =
    product.description?.slice(0, 160) ||
    t("page.listings.page.titleTarodanDaSatista", { title: product.title });
  const firstImage = product.images?.[0];
  const image = firstImage?.detailUrl || firstImage?.cardUrl || firstImage?.url;

  // Canonical, hreflang and og:url all name the canonical URL, even when this
  // request is the bare or stale form about to be redirected.
  const path = listingPath({ id, title: product.title });

  return {
    title,
    description,
    alternates: localizedAlternates(locale, path),
    openGraph: {
      title,
      description,
      type: "website",
      url: localizedPath(locale, path),
      images: image ? [{ url: image, alt: product.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { id: segment, locale } = await params;
  const id = parseListingParam(segment);
  if (!id) notFound();

  const queryClient = getServerQueryClient();
  const product = await fetchProduct(id);
  if (product) {
    // A public listing lives at one URL: the bare UUID, an upper-cased UUID
    // and a stale slug redirect permanently to `<slug>-<uuid>`, keeping the
    // locale prefix and the query (`?boost=`, utm). A non-public listing
    // (owner, pending) is not fetched here, so it renders at whatever URL was
    // used, with no loop. The root `[locale]/loading.tsx` streams the shell
    // before this runs, so Next delivers the redirect inside the HTML (an
    // instant `<meta http-equiv="refresh" content="0">`, which search engines
    // treat as permanent, plus a client-side replace), not as an HTTP 308.
    const canonical = canonicalListingPath(segment, {
      id,
      title: product.title,
    });
    if (canonical) {
      permanentRedirect({
        href: canonicalRedirectHref(canonical, await searchParams),
        locale,
      });
    }
    // Seed the query cache so the detail ships in the first HTML and the
    // client's `useQuery(queryKeys.product.detail(id))` hydrates without a
    // refetch flash. Only when the public fetch succeeds; otherwise the client
    // fetches (an owner viewing a pending listing needs its cookies).
    queryClient.setQueryData(queryKeys.product.detail(id), product);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ListingDetailClient
        staticInfo={product ? <ProductStaticInfo listing={product} /> : null}
        specs={
          product ? (
            <ProductStaticSpecs listing={product} locale={locale} />
          ) : null
        }
      />
    </HydrationBoundary>
  );
}
