/** @format */

import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import {
  fetchManufacturerBySlugServer,
  fetchManufacturerProductsServer,
} from "../_lib/data";
import ManufacturerDetailClient from "./ManufacturerDetailClient";
import { getTranslations } from "next-intl/server";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations();
  const { slug } = await params;
  const brand = await fetchManufacturerBySlugServer(slug);
  if (!brand?.name)
    return { title: t("page.manufacturers.page.ureticiBulunamadiTarodan") };

  const description =
    brand.description?.slice(0, 160) ||
    t("page.manufacturers.page.nameDiecastModelleriVeIlanlariTarodan", {
      name: brand.name,
    });

  return {
    title: `${brand.name} | Tarodan`,
    description,
    openGraph: {
      title: `${brand.name} | Tarodan`,
      description,
      type: "website",
      url: `/manufacturers/${slug}`,
      images: brand.logo ? [{ url: brand.logo, alt: brand.name }] : undefined,
    },
  };
}

export default async function ManufacturerDetailPage({ params }: Props) {
  const { slug } = await params;

  // Seed the brand (and its listings) server-side so the detail ships in the
  // first HTML for crawlers and the client hydrates without a refetch flash.
  const queryClient = getServerQueryClient();
  const brand = await fetchManufacturerBySlugServer(slug);
  if (brand) {
    queryClient.setQueryData(queryKeys.manufacturers.detail(slug), brand);
    if (brand.id) {
      const products = await fetchManufacturerProductsServer(brand.id);
      queryClient.setQueryData(
        queryKeys.manufacturers.products(slug),
        products,
      );
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ManufacturerDetailClient />
    </HydrationBoundary>
  );
}
