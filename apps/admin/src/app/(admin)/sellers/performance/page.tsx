'use client';

import { UsersIcon, ShoppingBagIcon, CubeIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { StatusBadge, Badge } from '@tarodan/ui';
import { useAdminResource } from '@/hooks/useAdminResource';
import { adminApi } from '@/lib/api';
import { ResourceListPage } from '@/components/ResourceListPage';
import { type ColumnDef } from '@/components/DataTable';

interface Seller {
  id: string;
  displayName: string;
  email: string;
  sellerType: string | null;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  membership?: { tier?: { type?: string; name?: string } };
  _count: {
    products: number;
    sellerOrders: number;
  };
}

const membershipConfig: Record<string, { label: string; variant: 'success' | 'info' | 'primary' | 'secondary' }> = {
  business: { label: 'Kurumsal',  variant: 'primary' },
  premium:  { label: 'Premium',   variant: 'success' },
  basic:    { label: 'Temel',     variant: 'info'    },
  free:     { label: 'Ücretsiz',  variant: 'secondary' },
};

export default function SellerPerformancePage() {
  const { rows: sellers, total, page, setPage, totalPages, isLoading, search, setSearch, onSearchSubmit } =
    useAdminResource<Seller>({
      queryKey: 'sellers-performance',
      fetcher: (params) => adminApi.getUsers({ ...params, isSeller: true }),
      limit: 20,
      syncUrl: true,
    });

  const topByOrders = [...sellers].sort((a, b) => b._count.sellerOrders - a._count.sellerOrders)[0];

  const columns: ColumnDef<Seller, any>[] = [
    {
      header: 'Satıcı',
      cell: ({ row }) => (
        <>
          <p className="font-medium text-heading">{row.original.displayName}</p>
          <p className="text-xs text-muted">{row.original.email}</p>
        </>
      ),
    },
    {
      header: 'Üyelik',
      cell: ({ row }) => {
        const tierType = row.original.membership?.tier?.type ?? 'free';
        const cfg = membershipConfig[tierType] ?? membershipConfig.free;
        return <StatusBadge status={tierType} config={membershipConfig} />;
      },
    },
    {
      header: 'Ürün',
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 text-sm text-heading">
          <CubeIcon className="w-4 h-4 text-muted shrink-0" />
          {row.original._count.products}
        </span>
      ),
    },
    {
      header: 'Sipariş',
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 text-sm text-heading">
          <ShoppingBagIcon className="w-4 h-4 text-muted shrink-0" />
          {row.original._count.sellerOrders}
        </span>
      ),
    },
    {
      header: 'Durum',
      cell: ({ row }) =>
        row.original.isBanned ? (
          <Badge variant="danger">Yasaklı</Badge>
        ) : row.original.isVerified ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="warning">Doğrulanmamış</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Özet kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="admin-card p-4 flex items-center gap-4">
          <div className="p-3 bg-info-500/10 rounded-lg shrink-0">
            <UsersIcon className="w-6 h-6 text-info-500" />
          </div>
          <div>
            <p className="text-sm text-muted">Toplam Satıcı</p>
            <p className="text-xl font-bold text-heading">{total}</p>
          </div>
        </div>

        <div className="admin-card p-4 flex items-center gap-4">
          <div className="p-3 bg-primary-500/10 rounded-lg shrink-0">
            <ChartBarIcon className="w-6 h-6 text-primary-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted">En Çok Siparişli</p>
            <p className="text-sm font-bold text-heading truncate" title={topByOrders?.displayName}>
              {topByOrders ? `${topByOrders.displayName} (${topByOrders._count.sellerOrders})` : '—'}
            </p>
          </div>
        </div>

        <div className="admin-card p-4 flex items-center gap-4">
          <div className="p-3 bg-success-500/10 rounded-lg shrink-0">
            <CubeIcon className="w-6 h-6 text-success-500" />
          </div>
          <div>
            <p className="text-sm text-muted">Bu Sayfada Toplam Ürün</p>
            <p className="text-xl font-bold text-heading">
              {sellers.reduce((s, x) => s + x._count.products, 0)}
            </p>
          </div>
        </div>
      </div>

      <ResourceListPage
        title="Satıcı Performansı"
        description="Satıcıların sipariş ve ürün metrikleri"
        search={{ placeholder: "Satıcı ara..." }}
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={onSearchSubmit}
        columns={columns}
        data={sellers}
        loading={isLoading}
        getRowId={(s) => s.id}
        emptyText="Satıcı bulunamadı"
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
