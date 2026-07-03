'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/DataTable';
import { useResourceList } from '@/components/list';
import { mapProducts } from '../_lib/types';
import { productColumns, type ProductRowActions } from '../_lib/columns';

/** Maps the raw product rows from context and renders the shared DataTable. */
export function ProductsTable(actions: ProductRowActions) {
  const router = useRouter();
  const { rows, isLoading, filters, search } = useResourceList<any>();
  const products = useMemo(() => mapProducts(rows), [rows]);
  const columns = productColumns(actions);

  const filtered = search || filters.status !== 'all' || filters.brandId || filters.carModelId;

  return (
    <DataTable
      columns={columns}
      data={products}
      loading={isLoading}
      getRowId={(p) => p.id}
      onRowClick={(p) => router.push(`/catalog/products/${p.id}`)}
      emptyText={filtered ? 'Filtreyle eşleşen ürün yok' : 'Ürün bulunamadı'}
    />
  );
}
