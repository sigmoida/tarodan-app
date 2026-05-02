'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowsRightLeftIcon, HeartIcon } from '@heroicons/react/24/outline';
import OptimizedImage from '@/components/OptimizedImage';
import { listingsApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { Spinner } from '@tarodan/ui';

interface ProductLike {
  id: string;
  title: string;
  condition: string;
  status: string;
  quantity?: number | null;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  isTradeEnabled?: boolean;
  images?: string[];
  category?: { id: string; name: string; slug: string } | null;
}

const conditionLabels: Record<string, string> = {
  new: 'Sıfır',
  like_new: 'Sıfır Gibi',
  very_good: 'Çok İyi',
  good: 'İyi',
  fair: 'Orta',
};

function ConditionLabel({ condition }: { condition: string }) {
  return <>{conditionLabels[condition] ?? condition}</>;
}

export default function ProductUnavailablePage() {
  const params = useParams<{ productId: string }>();
  const productId = params?.productId as string;
  const [product, setProduct] = useState<ProductLike | null>(null);
  const [similar, setSimilar] = useState<ProductLike[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    Promise.all([
      listingsApi.getById(productId).then((r) => r.data).catch(() => null),
      listingsApi.getSimilar(productId, 12).then((r) => r.data).catch(() => []),
    ]).then(([p, s]) => {
      setProduct(p as ProductLike | null);
      setSimilar((s as ProductLike[]) ?? []);
      setLoading(false);
    });
  }, [productId]);

  if (loading) {
    return (
      <div className="container mx-auto py-16 flex justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Stok geri gelmiş olabilir (admin restock veya refund). Bu durumda
  // "stokta yok" demek yanıltır; kullanıcıyı doğrudan ürüne yönlendirelim.
  const isBackInStock =
    !!product && product.status === 'active' && (product.quantity ?? 0) > 0;

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      {/* Hero */}
      <div className="bg-surface-elevated border border-border rounded-xl p-6 sm:p-10 text-center mb-10">
        {isBackInStock ? (
          <>
            <div className="text-5xl mb-3">🎉</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-heading mb-2">
              İyi haber: ürün tekrar satışta!
            </h1>
            <p className="text-subtle max-w-xl mx-auto">
              {product?.title ? `"${product.title}" tekrar stoğa düştü.` : 'Beklediğiniz ürün tekrar satışta.'} Hemen incelemek ister misin?
            </p>
            <Link
              href={`/listings/${productId}`}
              className="inline-block mt-5 px-5 py-2 rounded-md bg-primary-600 text-inverted hover:bg-primary-700 transition"
            >
              Ürünü gör
            </Link>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3">❌</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-heading mb-2">
              Bu ürün artık stokta yok
            </h1>
            <p className="text-subtle max-w-xl mx-auto">
              {product?.title
                ? `"${product.title}" başka bir alıcı tarafından satın alındı.`
                : 'Üzgünüz, baktığınız ürün artık satışta değil.'}{' '}
              Aşağıda aynı kategoriden alternatif ürünleri inceleyebilirsiniz.
            </p>
            {product?.category?.slug && (
              <Link
                href={`/category/${product.category.slug}`}
                className="inline-block mt-5 px-5 py-2 rounded-md bg-primary-600 text-inverted hover:bg-primary-700 transition"
              >
                Tüm {product.category.name ?? 'kategori'} ürünleri
              </Link>
            )}
          </>
        )}
      </div>

      {/* Benzer ürünler */}
      <h2 className="text-xl font-semibold text-heading mb-4">
        Benzer ürünler
      </h2>
      {similar.length === 0 ? (
        <p className="text-subtle">Bu kategoride başka aktif ürün bulunamadı.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {similar.map((p) => (
            <Link
              key={p.id}
              href={`/listings/${p.id}`}
              className="bg-surface-elevated rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all group shadow-sm border border-border"
            >
              <div className="aspect-square relative bg-surface-alt">
                <OptimizedImage
                  src={p.images?.[0] || 'https://placehold.co/400x400/1a1a2e/666?text=No+Image'}
                  alt={p.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform"
                  fallbackSrc="https://placehold.co/400x400/1a1a2e/666?text=No+Image"
                  logContext={{ productId: p.id, page: 'unavailable-similar' }}
                />
                {p.isTradeEnabled && (
                  <span className="absolute top-2 left-2 bg-primary-600 text-inverted text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                    <ArrowsRightLeftIcon className="h-3 w-3" />
                    Takas
                  </span>
                )}
                <span className="absolute top-2 right-2 p-2 bg-surface-elevated/90 backdrop-blur-sm rounded-full">
                  <HeartIcon className="h-5 w-5 text-body" />
                </span>
              </div>
              <div className="p-4">
                <h3 className="text-heading font-medium line-clamp-2 mb-2">
                  {p.title}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-primary-500 font-bold text-lg">
                    {getProductEffectivePrice(p as any).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    TL
                  </span>
                  <span className="text-xs text-muted">
                    <ConditionLabel condition={p.condition} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
