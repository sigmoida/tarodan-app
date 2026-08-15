/** @format */

"use client";

import { useParams } from "next/navigation";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { SectionCard, ProductCard, ButtonLink } from "@/components/ui";
import { useUnavailableProduct } from "../_hooks/useUnavailableProduct";
import { useTranslations } from "next-intl";

export default function ProductUnavailableClient() {
  const t = useTranslations();
  const params = useParams<{ productId: string }>();
  const productId = params?.productId as string;
  const { product, similar, isLoading, isBackInStock } =
    useUnavailableProduct(productId);

  if (isLoading) {
    return (
      <PageShell className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="xl" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Hero */}
      <SectionCard className="text-center">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            isBackInStock
              ? t("product.unavailable.bgSuccess100TextSuccess600")
              : t("product.unavailable.bgDanger100TextDanger600")
          }`}
        >
          {isBackInStock ? (
            <CheckCircleIcon className="h-8 w-8" />
          ) : (
            <XCircleIcon className="h-8 w-8" />
          )}
        </div>

        {isBackInStock ? (
          <>
            <h1 className="mb-2 text-2xl font-bold text-heading sm:text-3xl">
              {t("product.unavailable.iyiHaberUrunTekrarSatista")}
            </h1>
            <p className="mx-auto mb-6 max-w-xl text-muted">
              {product?.title
                ? t("product.unavailable.titleTekrarStogaDustu", {
                    title: product.title,
                  })
                : t("product.unavailable.beklediginizUrunTekrarSatista")}{" "}
              Hemen incelemek ister misin?
            </p>
            <ButtonLink variant="primary" href={`/listings/${productId}`}>
              {t("product.unavailable.urunuGor")}
            </ButtonLink>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-2xl font-bold text-heading sm:text-3xl">
              {t("product.unavailable.buUrunArtikStoktaYok")}
            </h1>
            <p className="mx-auto mb-6 max-w-xl text-muted">
              {product?.title
                ? t("product.unavailable.titleBaskaBirAliciTarafindanSatin", {
                    title: product.title,
                  })
                : t(
                    "product.unavailable.uzgunuzBaktiginizUrunArtikSatistaDegil",
                  )}{" "}
              {t("product.unavailable.browseAlternatives")}
            </p>
            {product?.category?.slug && (
              <ButtonLink
                variant="primary"
                href={`/listings?category=${product.category.slug}`}
              >
                {t("product.unavailable.allCategoryProducts", {
                  category:
                    product.category.name ??
                    t("product.unavailable.categoryFallback"),
                })}
              </ButtonLink>
            )}
          </>
        )}
      </SectionCard>

      {/* Similar products */}
      <SectionCard title={t("product.unavailable.benzerUrunler")}>
        {similar.length === 0 ? (
          <p className="text-muted">
            {t("product.unavailable.buKategorideBaskaAktifUrunBulunamadi")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {similar.map((p) => (
              <ProductCard key={p.id} product={p} href={`/listings/${p.id}`} />
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
