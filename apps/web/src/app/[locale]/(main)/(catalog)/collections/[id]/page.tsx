import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import CollectionDetailClient from "./CollectionDetailClient";

import { getServerApiOrigin } from "@/lib/api/origin";

const API_BASE = getServerApiOrigin();

type Props = { params: Promise<{ id: string }> };

/**
 * Fetch a collection by id OR slug (the `[id]` segment can be either) and unwrap it
 * to the SAME shape the client query stores (`response.data.collection ||
 * response.data`), so the result can seed the cache. `revalidate: 60` lets Next
 * dedupe the `generateMetadata` and page fetches into a single request.
 */
async function getCollection(idOrSlug: string): Promise<any | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/collections/${encodeURIComponent(idOrSlug)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.collection ?? json?.data ?? json;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection?.name) return { title: "Koleksiyon Bulunamadı | Tarodan" };

  const title = `${collection.name} | Tarodan`;
  const description =
    collection.description?.slice(0, 160) ||
    `${collection.name} koleksiyonunu Tarodan'da keşfedin`;
  const image = collection.coverImageUrl || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/collections/${id}`,
      images: image ? [{ url: image, alt: collection.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { id } = await params;

  // Seed the collection server-side under the SAME key the client `useQuery` uses
  // (`['collection', idOrSlug]`) so the body ships in the first HTML for crawlers
  // and the client hydrates without a refetch flash.
  const queryClient = getServerQueryClient();
  const collection = await getCollection(id);
  if (collection) queryClient.setQueryData(["collection", id], collection);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CollectionDetailClient />
    </HydrationBoundary>
  );
}
