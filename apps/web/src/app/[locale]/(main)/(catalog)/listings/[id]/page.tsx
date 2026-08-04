import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import { getServerApiOrigin } from "@/lib/api/origin";
import ListingDetailClient from "./ListingDetailClient";
import ProductStaticInfo from "./_sections/ProductStaticInfo";
import ProductStaticSpecs from "./_sections/ProductStaticSpecs";
import type { Listing } from "./_lib/types";
import { formatTL } from "@/lib/format";

const API_BASE = getServerApiOrigin();

type Props = { params: Promise<{ id: string; locale: string }> };

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
  const { id } = await params;
  const product = (await fetchProduct(id)) as ProductForMeta | null;
  if (!product?.title) return { title: "İlan Bulunamadı | Tarodan" };

  const priceNum = Number(product.price);
  const priceText = Number.isFinite(priceNum) ? ` - ${formatTL(priceNum)}` : "";
  const title = `${product.title}${priceText} | Tarodan`;
  const description =
    product.description?.slice(0, 160) || `${product.title} Tarodan'da satışta`;
  const firstImage = product.images?.[0];
  const image = firstImage?.detailUrl || firstImage?.cardUrl || firstImage?.url;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/listings/${id}`,
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

export default async function ListingPage({ params }: Props) {
  const { id, locale } = await params;

  // Seed the query cache server-side so the detail ships in the first HTML and
  // the client's `useQuery(['listing', id])` hydrates without a refetch flash.
  // Only seed when the public fetch succeeds; otherwise leave it to the client
  // (owner viewing a pending listing needs its cookies).
  const queryClient = getServerQueryClient();
  const product = await fetchProduct(id);
  if (product) {
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
