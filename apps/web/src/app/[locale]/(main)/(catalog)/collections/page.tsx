import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import {
  fetchPublicCollectionsServer,
  fetchCategoriesServer,
} from "./_lib/data";
import { localizedCanonical, localizedPath } from "@/lib/seo";
import CollectionsClient from "./CollectionsClient";
import type { Translate } from "@/types/i18n";
import { getTranslations } from "next-intl/server";

const TITLE = (t: Translate) => t("page.collections.page.koleksiyonlarTarodan");
const DESCRIPTION = (t: Translate) =>
  t(
    "page.collections.page.diecastModelArabaKoleksiyonlariniKesfedinKategoriye",
  );

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: TITLE(t),
    description: DESCRIPTION(t),
    alternates: localizedCanonical(locale, "/collections"),
    openGraph: {
      title: TITLE(t),
      description: DESCRIPTION(t),
      type: "website",
      url: localizedPath(locale, "/collections"),
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE(t),
      description: DESCRIPTION(t),
    },
  };
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CollectionsPage({ searchParams }: Props) {
  const rawCategoryId = (await searchParams).categoryId;
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
