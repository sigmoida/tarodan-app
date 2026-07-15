import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import {
  PAGE_LIMIT,
  parseListingsFilters,
  getListingsPage,
  buildListApiParams,
} from "./_lib/params";
import { fetchCategoryServer, fetchListingsServer } from "./_lib/data";
import { localizedCanonical, localizedPath } from "@/lib/seo";
import ListingsClient from "./ListingsClient";

const TITLE = "Ürünler | Tarodan";
const DESCRIPTION =
  "Diecast model araba, koleksiyon ve model araç ilanlarını keşfedin. Markaya, ölçeğe, fiyata ve duruma göre filtreleyin; takas ve indirimli ürünleri bulun.";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: localizedCanonical(locale, "/listings"),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      type: "website",
      url: localizedPath(locale, "/listings"),
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    },
  };
}

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * Rebuild a URLSearchParams from Next's plain searchParams object so the exact
 * same shared parsers (parseListingsFilters / getListingsPage) run on the
 * server and the client. `.get()` returns the first value, matching
 * `useSearchParams().get()` on the client.
 */
function toSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    } else if (value !== undefined) {
      sp.set(key, value);
    }
  }
  return sp;
}

export default async function ListingsPage({ searchParams }: Props) {
  const sp = toSearchParams(searchParams);
  const filters = parseListingsFilters(sp);
  const page = getListingsPage(sp);

  const queryClient = getServerQueryClient();

  // Resolve the category the same way the client does: an explicit `categoryId`
  // wins; otherwise a category *slug* is resolved to its id. When resolving from
  // a slug we ALSO seed `['categoryBySlug', slug]` so the client reads its `.id`
  // synchronously on first render — that keeps resolvedCategoryId (and thus the
  // listings key) identical to the server seed, so there's no refetch flash.
  const urlCategoryId = sp.get("categoryId") || "";
  const categorySlug = filters.category;
  let resolvedCategoryId: string | undefined = urlCategoryId || undefined;

  if (categorySlug && !urlCategoryId) {
    const category = await fetchCategoryServer(categorySlug);
    if (category) {
      queryClient.setQueryData(
        queryKeys.category.bySlug(categorySlug),
        category,
      );
      resolvedCategoryId = category.id;
    }
  }

  // Seed the first listings page with the SAME key the client's useQuery uses.
  const apiParams = buildListApiParams(
    filters,
    resolvedCategoryId,
    page,
    PAGE_LIMIT,
  );
  const listingsData = await fetchListingsServer(apiParams, page);
  if (listingsData) {
    queryClient.setQueryData(
      queryKeys.listings.list(filters, resolvedCategoryId, page),
      listingsData,
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ListingsClient />
    </HydrationBoundary>
  );
}
