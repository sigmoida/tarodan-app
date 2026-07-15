/** @format */

"use client";

import { useParams } from "next/navigation";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { SectionCard, ProductCard, ButtonLink } from "@/components/ui";
import { useUnavailableProduct } from "../_hooks/useUnavailableProduct";

export default function ProductUnavailableClient() {
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
              ? "bg-success-100 text-success-600"
              : "bg-danger-100 text-danger-600"
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
              İyi haber: ürün tekrar satışta!
            </h1>
            <p className="mx-auto mb-6 max-w-xl text-muted">
              {product?.title
                ? `"${product.title}" tekrar stoğa düştü.`
                : "Beklediğiniz ürün tekrar satışta."}{" "}
              Hemen incelemek ister misin?
            </p>
            <ButtonLink variant="primary" href={`/listings/${productId}`}>
              Ürünü gör
            </ButtonLink>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-2xl font-bold text-heading sm:text-3xl">
              Bu ürün artık stokta yok
            </h1>
            <p className="mx-auto mb-6 max-w-xl text-muted">
              {product?.title
                ? `"${product.title}" başka bir alıcı tarafından satın alındı.`
                : "Üzgünüz, baktığınız ürün artık satışta değil."}{" "}
              Aşağıda aynı kategoriden alternatif ürünleri inceleyebilirsiniz.
            </p>
            {product?.category?.slug && (
              <ButtonLink
                variant="primary"
                href={`/listings?category=${product.category.slug}`}
              >
                Tüm {product.category.name ?? "kategori"} ürünleri
              </ButtonLink>
            )}
          </>
        )}
      </SectionCard>

      {/* Similar products */}
      <SectionCard title="Benzer ürünler">
        {similar.length === 0 ? (
          <p className="text-muted">
            Bu kategoride başka aktif ürün bulunamadı.
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
