'use client';

import { useParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { DetailPage } from '@/components/detail/DetailPage';
import { ProductDetailBody } from './_components/ProductDetailBody';
import { productStatusConfig, type ProductDetail } from './_lib/types';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <DetailPage<ProductDetail>
      resource="products"
      id={id}
      fetcher={(pid) => adminApi.getProduct(pid).then((r) => r.data)}
      backHref="/catalog/products"
      emptyTitle="Ürün bulunamadı"
      title={(p) => p.title}
      subtitle={(p) => `Kategori: ${p.category.name}`}
      badge={(p) => {
        const s = productStatusConfig[p.status] ?? productStatusConfig.pending;
        return (
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${s.color} ${s.bg}`}>
            {s.label}
          </span>
        );
      }}
    >
      {(p) => <ProductDetailBody product={p} />}
    </DetailPage>
  );
}
