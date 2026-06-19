'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Select, StatusBadge } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
import { type ColumnDef } from '@/components/DataTable';
import { ResourceListPage } from '@/components/ResourceListPage';
import { useAdminResource } from '@/hooks/useAdminResource';
import {
    CheckCircleIcon,
    XCircleIcon,
    StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Review {
    id: string;
    score: number;
    title?: string;
    review?: string;
    status: 'pending' | 'approved' | 'rejected';
    adminReply?: string;
    adminReplyAt?: string;
    createdAt: string;
    isVerifiedPurchase: boolean;
    user: {
        id: string;
        displayName: string;
        email: string;
        avatar?: string;
    };
    product: {
        id: string;
        title: string;
        images: { url: string }[];
    };
}

interface UserRating {
    id: string;
    score: number;
    comment?: string;
    status?: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    orderId?: string;
    tradeId?: string;
    giver: { id: string; displayName: string; email: string };
    receiver: { id: string; displayName: string; email: string };
}

const reviewStatusConfig: Record<string, StatusConfig> = {
    approved: { label: 'Onaylı', variant: 'success' },
    pending: { label: 'Bekliyor', variant: 'warning' },
    rejected: { label: 'Reddedildi', variant: 'danger' },
};

function renderStars(score: number) {
    return (
        <div className="flex text-warning-500">
            {[...Array(5)].map((_, i) =>
                i < score ? (
                    <StarIconSolid key={i} className="w-4 h-4" />
                ) : (
                    <StarIcon key={i} className="w-4 h-4" />
                )
            )}
        </div>
    );
}

export default function ReviewsPage() {
    const [activeTab, setActiveTab] = useState<'product' | 'seller'>('product');

    // ── Tek useAdminResource çağrısı — queryKey'e activeTab katıyoruz ──────────
    const r = useAdminResource<Review | UserRating>({
        queryKey: `reviews:${activeTab}`,
        fetcher: (params) =>
            activeTab === 'product'
                ? adminApi.getReviews(params)
                : adminApi.getUserRatings(params),
        limit: 10,
        syncUrl: true,
        initialFilters: { status: '' },
        errorMessage:
            activeTab === 'product'
                ? 'Yorumlar yüklenirken hata oluştu'
                : 'Satıcı yorumları yüklenirken hata oluştu',
        debounceMs: 300,
    });

    // Sekme değişince sayfa + filtre sıfırla
    const handleTabChange = (key: string) => {
        setActiveTab(key as 'product' | 'seller');
        r.setPage(1);
        r.setFilter('status', '');
        if (key === 'product') {
            r.setSearch('');
        }
    };

    // ── Ürün yorumu aksiyonları ────────────────────────────────────────────────
    const handleStatusUpdate = async (id: string, status: string) => {
        try {
            await adminApi.updateReviewStatus(id, status);
            toast.success(`Yorum durumu güncellendi: ${status}`);
            r.refetch();
        } catch {
            toast.error('Güncelleme başarısız');
        }
    };

    // ── Satıcı yorumu aksiyonları ──────────────────────────────────────────────
    const handleSellerStatusUpdate = async (id: string, status: string) => {
        try {
            await adminApi.updateUserRatingStatus(id, status);
            toast.success(
                `Satıcı yorumu ${status === 'approved' ? 'onaylandı' : 'reddedildi'}`
            );
            r.refetch();
        } catch {
            toast.error('Güncelleme başarısız');
        }
    };

    // ── Kolon tanımları ────────────────────────────────────────────────────────
    const productColumns: ColumnDef<Review, any>[] = [
        {
            header: 'Ürün',
            cell: ({ row }) => {
                const review = row.original;
                return (
                    <div className="flex items-center gap-3">
                        {review.product.images?.[0] ? (
                            <div className="w-10 h-10 relative rounded overflow-hidden flex-shrink-0">
                                <Image
                                    src={review.product.images[0].url}
                                    alt={review.product.title}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                        ) : (
                            <div className="w-10 h-10 bg-surface-alt rounded flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                            <p
                                className="text-sm font-medium text-heading truncate max-w-[200px]"
                                title={review.product.title}
                            >
                                {review.product.title}
                            </p>
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Kullanıcı',
            cell: ({ row }) => {
                const review = row.original;
                return (
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 text-primary-600 font-bold text-xs">
                            {review.user.displayName.charAt(0)}
                        </div>
                        <div>
                            <p className="text-sm text-heading">{review.user.displayName}</p>
                            {review.isVerifiedPurchase && (
                                <span className="text-[10px] text-success-700 flex items-center gap-1">
                                    <CheckCircleIcon className="w-3 h-3" />
                                    Onaylı Alıcı
                                </span>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Değerlendirme',
            cell: ({ row }) => {
                const review = row.original;
                return (
                    <div className="space-y-1">
                        {renderStars(review.score)}
                        {review.title && (
                            <p className="font-medium text-heading text-sm">{review.title}</p>
                        )}
                        {review.review && (
                            <p className="text-muted text-sm line-clamp-3">{review.review}</p>
                        )}
                    </div>
                );
            },
        },
        {
            header: 'Durum',
            cell: ({ row }) => (
                <StatusBadge status={row.original.status} config={reviewStatusConfig} />
            ),
        },
        {
            header: 'Tarih',
            cell: ({ row }) => (
                <span className="text-sm text-muted">
                    {format(new Date(row.original.createdAt), 'dd MMM yyyy', { locale: tr })}
                </span>
            ),
        },
        {
            id: 'actions',
            header: 'İşlemler',
            cell: ({ row }) => {
                const review = row.original;
                return (
                    <div className="flex items-center justify-end gap-2">
                        {review.status !== 'approved' && (
                            <Button
                                variant="secondary"
                                onClick={() => handleStatusUpdate(review.id, 'approved')}
                                className="p-1.5 text-success-700 hover:bg-success-400/10 rounded-lg"
                                title="Onayla"
                            >
                                <CheckCircleIcon className="w-5 h-5" />
                            </Button>
                        )}
                        {review.status !== 'rejected' && (
                            <Button
                                variant="secondary"
                                onClick={() => handleStatusUpdate(review.id, 'rejected')}
                                className="p-1.5 text-danger-600 hover:bg-danger-400/10 rounded-lg"
                                title="Reddet"
                            >
                                <XCircleIcon className="w-5 h-5" />
                            </Button>
                        )}
                    </div>
                );
            },
        },
    ];

    const sellerColumns: ColumnDef<UserRating, any>[] = [
        {
            header: 'Gönderen',
            cell: ({ row }) => (
                <>
                    <p className="text-sm text-heading">{row.original.giver.displayName}</p>
                    <p className="text-xs text-muted">{row.original.giver.email}</p>
                </>
            ),
        },
        {
            header: 'Alıcı (Satıcı)',
            cell: ({ row }) => (
                <>
                    <p className="text-sm text-heading">{row.original.receiver.displayName}</p>
                    <p className="text-xs text-muted">{row.original.receiver.email}</p>
                </>
            ),
        },
        {
            header: 'Puan',
            cell: ({ row }) => renderStars(row.original.score),
        },
        {
            header: 'Yorum',
            cell: ({ row }) => (
                <p className="text-sm text-muted line-clamp-3">
                    {row.original.comment || '-'}
                </p>
            ),
        },
        {
            header: 'Durum',
            cell: ({ row }) => (
                <StatusBadge
                    status={row.original.status || 'approved'}
                    config={reviewStatusConfig}
                />
            ),
        },
        {
            header: 'Kaynak',
            cell: ({ row }) => (
                <span className="text-xs text-muted">
                    {row.original.orderId ? 'Sipariş' : row.original.tradeId ? 'Takas' : '-'}
                </span>
            ),
        },
        {
            header: 'Tarih',
            cell: ({ row }) => (
                <span className="text-sm text-muted">
                    {format(new Date(row.original.createdAt), 'dd MMM yyyy', { locale: tr })}
                </span>
            ),
        },
        {
            id: 'actions',
            header: 'İşlemler',
            cell: ({ row }) => {
                const rating = row.original;
                return (
                    <div className="flex items-center justify-end gap-2">
                        {rating.status !== 'approved' && (
                            <Button
                                variant="secondary"
                                onClick={() => handleSellerStatusUpdate(rating.id, 'approved')}
                                className="p-1.5 text-success-700 hover:bg-success-400/10 rounded-lg"
                                title="Onayla"
                            >
                                <CheckCircleIcon className="w-5 h-5" />
                            </Button>
                        )}
                        {rating.status !== 'rejected' && (
                            <Button
                                variant="secondary"
                                onClick={() => handleSellerStatusUpdate(rating.id, 'rejected')}
                                className="p-1.5 text-danger-600 hover:bg-danger-400/10 rounded-lg"
                                title="Reddet"
                            >
                                <XCircleIcon className="w-5 h-5" />
                            </Button>
                        )}
                    </div>
                );
            },
        },
    ];

    // ── Sekmeye göre branşla ───────────────────────────────────────────────────
    const isProduct = activeTab === 'product';

    const columns = isProduct
        ? (productColumns as ColumnDef<Review | UserRating, any>[])
        : (sellerColumns as ColumnDef<Review | UserRating, any>[]);

    const statusFilter = (
        <Select
            value={r.filters.status}
            onChange={(e) => r.setFilter('status', e.target.value)}
            className="sm:w-48"
            selectSize="sm"
        >
            <option value="">Tüm Durumlar</option>
            <option value="pending">Bekleyenler</option>
            <option value="approved">Onaylananlar</option>
            <option value="rejected">Reddedilenler</option>
        </Select>
    );

    return (
        <>
            <ResourceListPage<Review | UserRating>
                title="Yorumlar"
                description="Ürün ve satıcı yorumlarını yönetin"
                tabs={[
                    { key: 'product', label: 'Ürün Yorumları' },
                    { key: 'seller', label: 'Satıcı Yorumları' },
                ]}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                // Satıcı sekmesinde arama; ürün sekmesinde yok (backend desteklemese de dışarıda tutuyoruz —
                // orijinal davranışı korumak için: ürün sekmesinde arama kutusu yoktu)
                search={!isProduct ? { placeholder: 'Kullanıcı ara...' } : undefined}
                searchValue={!isProduct ? r.search : undefined}
                onSearchChange={!isProduct ? r.setSearch : undefined}
                onSearchSubmit={!isProduct ? r.onSearchSubmit : undefined}
                filters={statusFilter}
                columns={columns}
                data={r.rows}
                loading={r.isLoading}
                emptyText={isProduct ? 'Yorum bulunamadı' : 'Satıcı yorumu bulunamadı'}
                getRowId={(row) => row.id}
                page={r.page}
                totalPages={r.totalPages}
                onPageChange={r.setPage}
            />
        </>
    );
}
