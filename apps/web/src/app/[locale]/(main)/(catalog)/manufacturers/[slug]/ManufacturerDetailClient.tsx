/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge, Spinner } from "@tarodan/ui";
import { queryKeys } from "@/lib/query/keys";
import { useLocale, useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Product } from "@/types/product";
import {
  fetchManufacturerBySlugClient,
  fetchManufacturerProductsClient,
} from "../_lib/data";
import ManufacturerHero from "./_components/ManufacturerHero";
import ManufacturerProductsGrid from "./_components/ManufacturerProductsGrid";

export default function ManufacturerDetailClient() {
  const params = useParams();
  const slug = params?.slug as string;
  const t = useTranslations();

  const brandQuery = useQuery({
    queryKey: queryKeys.manufacturers.detail(slug),
    queryFn: () => fetchManufacturerBySlugClient(slug),
    enabled: !!slug,
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.manufacturers.products(slug),
    queryFn: () => fetchManufacturerProductsClient(brandQuery.data!.id),
    enabled: !!brandQuery.data?.id,
  });

  const brand = brandQuery.data;
  const products = (productsQuery.data ?? []) as Product[];

  if (brandQuery.isLoading) {
    return (
      <PageShell className="flex flex-col items-center justify-center">
        <Spinner
          size="2xl"
          color="border-primary-100 border-t-primary-500"
          className="mb-6"
        />
        <p className="text-subtle font-medium tracking-widest uppercase text-sm">
          {t("common.loading")}
        </p>
      </PageShell>
    );
  }

  if (!brand) {
    return (
      <PageShell className="flex flex-col items-center justify-center p-4 text-center">
        <div className="text-9xl mb-4 opacity-10 font-black">404</div>
        <h2 className="text-3xl font-bold text-heading mb-2">
          Üretici Bulunamadı
        </h2>
        <Link
          href="/manufacturers"
          className="mt-8 px-8 py-3 bg-heading text-inverted rounded-full font-bold hover:bg-primary-600 transition-all shadow-sm"
        >
          Tüm Üreticilere Dön
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell className="pb-24 pt-8">
      {/* `Container` sayfanın genişliğini ve yatay boşluğunu zaten veriyor;
          buradaki ikinci kap onu 1280px'e daraltıp boşluğu ikiye katlıyordu. */}
      <div>
        <PageHeader
          backHref="/manufacturers"
          backLabel={t("brands.backToAll") || "Tüm Üreticiler"}
          title={brand.name}
          actions={
            <Badge variant="info" size="sm">
              {brand.productCount} {t("brands.activeListings") || "Aktif İlan"}
            </Badge>
          }
        />

        <ManufacturerHero brand={brand} />

        <ManufacturerProductsGrid
          products={products}
          isLoading={productsQuery.isLoading}
        />
      </div>
    </PageShell>
  );
}
