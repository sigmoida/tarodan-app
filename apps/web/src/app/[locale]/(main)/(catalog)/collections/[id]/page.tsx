import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import { localizedCanonical, localizedPath } from "@/lib/seo";
import CollectionDetailClient from "./CollectionDetailClient";

import { getServerApiOrigin } from "@/lib/api/origin";
import { getTranslations } from "next-intl/server";

const API_BASE = getServerApiOrigin();

type Props = { params: Promise<{ id: string; locale: string }> };

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
  const t = await getTranslations();
  const { id, locale } = await params;
  const collection = await getCollection(id);
  if (!collection?.name)
    return { title: t("page.collections.page.koleksiyonBulunamadiTarodan") };

  const title = `${collection.name} | Tarodan`;
  const description =
    collection.description?.slice(0, 160) ||
    t("page.collections.page.nameKoleksiyonunuTarodanDaKesfedin", {
      name: collection.name,
    });
  const image = collection.coverImageUrl || undefined;
  // The `[id]` segment may be the id or a slug, and a slug is unique per owner
  // only, so the canonical URL is the id form. A readable collection URL is a
  // later phase (ADR 0017 covers listings only).
  const path = `/collections/${collection.id ?? id}`;

  return {
    title,
    description,
    alternates: localizedCanonical(locale, path),
    openGraph: {
      title,
      description,
      type: "website",
      url: localizedPath(locale, path),
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
  // (`queryKeys.collection.detail(idOrSlug)`) so the body ships in the first HTML for crawlers
  // and the client hydrates without a refetch flash.
  const queryClient = getServerQueryClient();
  const collection = await getCollection(id);
  if (collection)
    queryClient.setQueryData(queryKeys.collection.detail(id), collection);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CollectionDetailClient />
    </HydrationBoundary>
  );
}
