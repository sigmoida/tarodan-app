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
    TrashIcon,
    ExclamationTriangleIcon,
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
    status: 'pending' | 'approved' | 'rejected' | 'spam';
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
    status?: 'pending' | 'approved' | 'rejected' | 'spam';
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
    spam: { label: 'Spam', variant: 'secondary' },
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

    // Modal states
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleteSellerConfirm, setDeleteSellerConfirm] = useState<string | null>(null);

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

    const handleDelete = async (id: string) => {
        try {
            await adminApi.deleteReview(id);
            toast.success('Yorum silindi');
            setDeleteConfirm(null);
            r.refetch();
        } catch {
            toast.error('Silme işlemi başarısız');
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

    const handleDeleteSellerRating = async (id: string) => {
        try {
            await adminApi.deleteUserRating(id);
            toast.success('Satıcı yorumu silindi');
            setDeleteSellerConfirm(null);
            r.refetch();
        } catch {
            toast.error('Silme işlemi başarısız');
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
                        {review.adminReply && (
                            <div className="mt-2 pl-3 border-l-2 border-primary-500">
                                <p className="text-xs text-primary-400 font-medium">Satıcı Yanıtı:</p>
                                <p className="text-xs text-muted">{review.adminReply}</p>
                            </div>
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
                        {review.status === 'pending' && (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => handleStatusUpdate(review.id, 'approved')}
                                    className="p-1.5 text-success-700 hover:bg-success-400/10 rounded-lg"
                                    title="Onayla"
                                >
                                    <CheckCircleIcon className="w-5 h-5" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => handleStatusUpdate(review.id, 'rejected')}
                                    className="p-1.5 text-danger-600 hover:bg-danger-400/10 rounded-lg"
                                    title="Reddet"
                                >
                                    <XCircleIcon className="w-5 h-5" />
                                </Button>
                            </>
                        )}
                        {(review.status === 'approved' || review.status === 'pending') && (
                            <Button
                                variant="secondary"
                                onClick={() => handleStatusUpdate(review.id, 'spam')}
                                className="p-1.5 text-warning-700 hover:bg-warning-400/10 rounded-lg"
                                title="Spam Olarak İşaretle"
                            >
                                <ExclamationTriangleIcon className="w-5 h-5" />
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            onClick={() => setDeleteConfirm(review.id)}
                            className="p-1.5 text-muted hover:text-danger-600 hover:bg-danger-400/10 rounded-lg"
                            title="Sil"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </Button>
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
                        {(rating.status === 'pending' || !rating.status) && (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => handleSellerStatusUpdate(rating.id, 'approved')}
                                    className="p-1.5 text-success-700 hover:bg-success-400/10 rounded-lg"
                                    title="Onayla"
                                >
                                    <CheckCircleIcon className="w-5 h-5" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => handleSellerStatusUpdate(rating.id, 'rejected')}
                                    className="p-1.5 text-danger-600 hover:bg-danger-400/10 rounded-lg"
                                    title="Reddet"
                                >
                                    <XCircleIcon className="w-5 h-5" />
                                </Button>
                            </>
                        )}
                        <Button
                            variant="secondary"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteSellerConfirm(rating.id);
                            }}
                            className="p-1.5 text-muted hover:text-danger-600 hover:bg-danger-400/10 rounded-lg"
                            title="Sil"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </Button>
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
            <option value="spam">Spam</option>
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

            {/* Delete Seller Rating Confirmation */}
            {deleteSellerConfirm && (
                <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50">
                    <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
                        <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">
                            Satıcı Yorumunu Sil
                        </h3>
                        <p className="text-muted mb-6">
                            Bu satıcı yorumunu silmek istediğinizden emin misiniz? Bu işlem geri
                            alınamaz.
                        </p>
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => setDeleteSellerConfirm(null)}
                                className="flex-1"
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={() => handleDeleteSellerRating(deleteSellerConfirm)}
                                className="flex-1"
                            >
                                Sil
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50">
                    <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4 border border-border">
                        <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">
                            Yorumu Sil
                        </h3>
                        <p className="text-muted mb-6">
                            Bu yorumu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1"
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1"
                            >
                                Sil
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
