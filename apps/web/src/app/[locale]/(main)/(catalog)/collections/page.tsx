import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import {
  fetchPublicCollectionsServer,
  fetchCategoriesServer,
} from "./_lib/data";
import CollectionsClient from "./CollectionsClient";

const TITLE = "Koleksiyonlar | Tarodan";
const DESCRIPTION =
  "Diecast model araba koleksiyonlarını keşfedin. Kategoriye göre filtreleyin, popüler ve yeni koleksiyonları görüntüleyin, kendi koleksiyonunuzu oluşturun.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/collections" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "/collections",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function CollectionsPage({ searchParams }: Props) {
  const rawCategoryId = searchParams.categoryId;
  const categoryId =
    (Array.isArray(rawCategoryId) ? rawCategoryId[0] : rawCategoryId) || "";

  const queryClient = getServerQueryClient();

  // Seed the PUBLIC collections and the categories tree with the SAME keys the
  // client's `useQuery` uses (default state: sort 'popular', no search,
  // categoryId from the URL). The authenticated 'mine' tab is NOT prefetched.
  const [publicData, categories] = await Promise.all([
    fetchPublicCollectionsServer("popular", "", categoryId),
    fetchCategoriesServer(),
  ]);

  if (publicData) {
    queryClient.setQueryData(
      queryKeys.collections.public("popular", "", categoryId),
      publicData,
    );
  }
  if (categories) {
    queryClient.setQueryData(queryKeys.categories.collections(), categories);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CollectionsClient />
    </HydrationBoundary>
  );
}
