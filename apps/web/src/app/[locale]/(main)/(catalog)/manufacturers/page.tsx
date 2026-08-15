/** @format */

import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import { fetchManufacturersServer } from "./_lib/data";
import ManufacturersClient from "./ManufacturersClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("brands.manufacturersMeta.ureticilerTarodan"),
    description: t(
      "brands.manufacturersMeta.dunyaninEnPrestijliDiecastModelAraba",
    ),
    openGraph: {
      title: t("brands.manufacturersMeta.diecastUreticilerRehberiTarodan"),
      description: t(
        "brands.manufacturersMeta.hotWheelsMatchboxAUTOartMinichampsVe",
      ),
      type: "website",
      url: "/manufacturers",
    },
  };
}

export default async function ManufacturersPage() {
  // Seed the manufacturers list server-side so the guide ships in the first HTML
  // (crawlable) and the client's useQuery hydrates without a refetch flash.
  const queryClient = getServerQueryClient();
  const manufacturers = await fetchManufacturersServer();
  queryClient.setQueryData(queryKeys.manufacturers.list(), manufacturers);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ManufacturersClient />
    </HydrationBoundary>
  );
}
