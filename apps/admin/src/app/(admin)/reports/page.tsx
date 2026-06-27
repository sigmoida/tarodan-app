'use client';

import { adminApi } from '@/lib/api';
import { Select, StatusBadge } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
import { type ColumnDef } from '@/components/DataTable';
import { ResourceListPage } from '@/components/ResourceListPage';
import { useAdminResource } from '@/hooks/useAdminResource';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

// ── Tipler ───────────────────────────────────────────────────────────────────
type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';
type ReportType = 'product' | 'user' | 'collection' | 'message';

interface Report {
    id: string;
    type: ReportType;
    targetId: string;
    reason: string;
    description?: string;
    status: ReportStatus;
    createdAt: string;
    resolvedAt?: string;
    adminNote?: string;
    reporter?: {
        id: string;
        displayName: string;
        email: string;
    };
}

// ── Etiket eşleşmeleri ───────────────────────────────────────────────────────
const statusConfig: Record<string, StatusConfig> = {
    pending: { label: 'Bekliyor', variant: 'warning' },
    under_review: { label: 'İncelemede', variant: 'info' },
    resolved: { label: 'Çözüldü', variant: 'success' },
    dismissed: { label: 'Reddedildi', variant: 'default' },
};

const typeLabels: Record<string, string> = {
    product: 'Ürün',
    user: 'Kullanıcı',
    collection: 'Koleksiyon',
    message: 'Mesaj',
};

const reasonLabels: Record<string, string> = {
    spam: 'Spam',
    inappropriate_content: 'Uygunsuz İçerik',
    fake_product: 'Sahte/Yanıltıcı Ürün',
    scam: 'Dolandırıcılık',
    harassment: 'Taciz',
    hate_speech: 'Nefret Söylemi',
    counterfeit: 'Taklit Ürün',
    wrong_category: 'Yanlış Kategori',
    misleading_info: 'Yanıltıcı Bilgi',
    other: 'Diğer',
};

export default function ReportsPage() {
    const r = useAdminResource<Report>({
        queryKey: 'reports',
        fetcher: (params) =>
            adminApi.getUserReports({
                page: params.page,
                pageSize: params.limit,
                status: params.status && params.status !== 'all' ? params.status : undefined,
                type: params.type && params.type !== 'all' ? params.type : undefined,
            }),
        limit: 20,
        syncUrl: true,
        initialFilters: { status: 'all', type: 'all' },
        errorMessage: 'Şikayetler yüklenirken hata oluştu',
    });

    const columns: ColumnDef<Report, any>[] = [
        {
            header: 'Tür',
            cell: ({ row }) => (
                <span className="text-sm font-medium text-heading">
                    {typeLabels[row.original.type] ?? row.original.type}
                </span>
            ),
        },
        {
            header: 'Neden',
            cell: ({ row }) => (
                <span className="text-sm text-body">
                    {reasonLabels[row.original.reason] ?? row.original.reason}
                </span>
            ),
        },
        {
            header: 'Açıklama',
            cell: ({ row }) =>
                row.original.description ? (
                    <p
                        className="text-sm text-muted line-clamp-2 max-w-[280px]"
                        title={row.original.description}
                    >
                        {row.original.description}
                    </p>
                ) : (
                    <span className="text-subtle text-sm">—</span>
                ),
        },
        {
            header: 'Raporlayan',
            cell: ({ row }) =>
                row.original.reporter ? (
                    <div className="min-w-0">
                        <p className="text-sm text-heading truncate max-w-[180px]">
                            {row.original.reporter.displayName}
                        </p>
                        <p className="text-[11px] text-muted truncate max-w-[180px]">
                            {row.original.reporter.email}
                        </p>
                    </div>
                ) : (
                    <span className="text-subtle text-sm">—</span>
                ),
        },
        {
            header: 'Hedef ID',
            cell: ({ row }) => (
                <span className="text-[11px] text-muted font-mono" title={row.original.targetId}>
                    {row.original.targetId.slice(0, 8)}…
                </span>
            ),
        },
        {
            header: 'Tarih',
            cell: ({ row }) => (
                <span className="text-sm text-muted whitespace-nowrap">
                    {format(new Date(row.original.createdAt), 'dd MMM yyyy HH:mm', { locale: tr })}
                </span>
            ),
        },
        {
            header: 'Durum',
            cell: ({ row }) => <StatusBadge status={row.original.status} config={statusConfig} />,
        },
    ];

    const filters = (
        <>
            <Select
                value={r.filters.type}
                onChange={(e) => r.setFilter('type', e.target.value)}
                className="sm:w-44"
                selectSize="sm"
            >
                <option value="all">Tüm Türler</option>
                <option value="product">Ürün</option>
                <option value="user">Kullanıcı</option>
                <option value="collection">Koleksiyon</option>
                <option value="message">Mesaj</option>
            </Select>
            <Select
                value={r.filters.status}
                onChange={(e) => r.setFilter('status', e.target.value)}
                className="sm:w-44"
                selectSize="sm"
            >
                <option value="all">Tüm Durumlar</option>
                <option value="pending">Bekliyor</option>
                <option value="under_review">İncelemede</option>
                <option value="resolved">Çözüldü</option>
                <option value="dismissed">Reddedildi</option>
            </Select>
        </>
    );

    return (
        <ResourceListPage<Report>
            title="Rapor Talepleri"
            description="Kullanıcıların ürün, kullanıcı, koleksiyon ve mesajlar için gönderdiği şikayetler"
            filters={filters}
            columns={columns}
            data={r.rows}
            loading={r.isLoading}
            emptyText="Henüz şikayet yok"
            getRowId={(row) => row.id}
            page={r.page}
            totalPages={r.totalPages}
            onPageChange={r.setPage}
        />
    );
}
