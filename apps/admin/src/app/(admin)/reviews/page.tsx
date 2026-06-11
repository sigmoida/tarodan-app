'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button, Input, Select, StatusBadge } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
import { AdminTabs } from '@/components/AdminTabs';
import { DataTable, type ColumnDef } from '@/components/DataTable';
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

export default function ReviewsPage() {
    const [activeTab, setActiveTab] = useState<'product' | 'seller'>('product');
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Seller ratings state
    const [sellerRatings, setSellerRatings] = useState<UserRating[]>([]);
    const [sellerLoading, setSellerLoading] = useState(true);
    const [sellerPage, setSellerPage] = useState(1);
    const [sellerTotalPages, setSellerTotalPages] = useState(1);
    const [sellerSearch, setSellerSearch] = useState('');
    const [sellerStatusFilter, setSellerStatusFilter] = useState<string>('');

    // Modal states
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleteSellerConfirm, setDeleteSellerConfirm] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab === 'product') loadReviews();
    }, [page, statusFilter, activeTab]);

    useEffect(() => {
        if (activeTab === 'seller') loadSellerRatings();
    }, [sellerPage, sellerSearch, sellerStatusFilter, activeTab]);

    const loadSellerRatings = async () => {
        setSellerLoading(true);
        try {
            const response = await adminApi.getUserRatings({
                page: sellerPage,
                limit: 10,
                search: sellerSearch || undefined,
                status: sellerStatusFilter || undefined,
            });
            setSellerRatings(response.data.data);
            setSellerTotalPages(response.data.meta.totalPages);
        } catch (error: any) {
            console.error('Failed to load seller ratings:', error);
            toast.error('Satıcı yorumları yüklenirken hata oluştu');
        } finally {
            setSellerLoading(false);
        }
    };

    const handleDeleteSellerRating = async (id: string) => {
        try {
            await adminApi.deleteUserRating(id);
            toast.success('Satıcı yorumu silindi');
            setDeleteSellerConfirm(null);
            loadSellerRatings();
        } catch (error: any) {
            toast.error('Silme işlemi başarısız');
        }
    };

    const handleSellerStatusUpdate = async (id: string, status: string) => {
        try {
            await adminApi.updateUserRatingStatus(id, status);
            toast.success(`Satıcı yorumu ${status === 'approved' ? 'onaylandı' : 'reddedildi'}`);
            loadSellerRatings();
        } catch (error: any) {
            toast.error('Güncelleme başarısız');
        }
    };

    const loadReviews = async () => {
        setLoading(true);
        try {
            const response = await adminApi.getReviews({
                page,
                limit: 10,
                status: statusFilter || undefined,
            });
            setReviews(response.data.data);
            setTotalPages(response.data.meta.totalPages);
        } catch (error: any) {
            console.error('Failed to load reviews:', error);
            toast.error('Yorumlar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id: string, status: string) => {
        try {
            await adminApi.updateReviewStatus(id, status);
            toast.success(`Yorum durumu güncellendi: ${status}`);
            loadReviews();
        } catch (error: any) {
            toast.error('Guncelleme başarısız');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await adminApi.deleteReview(id);
            toast.success('Yorum silindi');
            setDeleteConfirm(null);
            loadReviews();
        } catch (error: any) {
            toast.error('Silme işlemi başarısız');
        }
    };

    const renderStars = (score: number) => {
        return (
            <div className="flex text-warning-500">
                {[...Array(5)].map((_, i) => (
                    i < score ? (
                        <StarIconSolid key={i} className="w-4 h-4" />
                    ) : (
                        <StarIcon key={i} className="w-4 h-4" />
                    )
                ))}
            </div>
        );
    };

    const reviewStatusConfig: Record<string, StatusConfig> = {
        approved: { label: 'Onaylı', variant: 'success' },
        pending: { label: 'Bekliyor', variant: 'warning' },
        rejected: { label: 'Reddedildi', variant: 'danger' },
        spam: { label: 'Spam', variant: 'secondary' },
    };

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
                <p className="text-sm text-muted line-clamp-3">{row.original.comment || '-'}</p>
            ),
        },
        {
            header: 'Durum',
            cell: ({ row }) => <StatusBadge status={row.original.status || 'approved'} config={reviewStatusConfig} />,
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
                const r = row.original;
                return (
                    <div className="flex items-center justify-end gap-2">
                        {(r.status === 'pending' || !r.status) && (
                            <>
                                <Button variant="secondary" onClick={() => handleSellerStatusUpdate(r.id, 'approved')}
                                    className="p-1.5 text-success-700 hover:bg-success-400/10 rounded-lg"
                                    title="Onayla">
                                    <CheckCircleIcon className="w-5 h-5" />
                                </Button>
                                <Button variant="secondary" onClick={() => handleSellerStatusUpdate(r.id, 'rejected')}
                                    className="p-1.5 text-danger-600 hover:bg-danger-400/10 rounded-lg"
                                    title="Reddet">
                                    <XCircleIcon className="w-5 h-5" />
                                </Button>
                            </>
                        )}
                        <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setDeleteSellerConfirm(r.id); }}
                            className="p-1.5 text-muted hover:text-danger-600 hover:bg-danger-400/10 rounded-lg"
                            title="Sil">
                            <TrashIcon className="w-5 h-5" />
                        </Button>
                    </div>
                );
            },
        },
    ];

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
                            <p className="text-sm font-medium text-heading truncate max-w-[200px]" title={review.product.title}>
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
                        {review.title && <p className="font-medium text-heading text-sm">{review.title}</p>}
                        {review.review && <p className="text-muted text-sm line-clamp-3">{review.review}</p>}
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
            cell: ({ row }) => <StatusBadge status={row.original.status} config={reviewStatusConfig} />,
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
                                <Button variant="secondary" onClick={() => handleStatusUpdate(review.id, 'approved')}
                                    className="p-1.5 text-success-700 hover:bg-success-400/10 rounded-lg"
                                    title="Onayla">
                                    <CheckCircleIcon className="w-5 h-5" />
                                </Button>
                                <Button variant="secondary" onClick={() => handleStatusUpdate(review.id, 'rejected')}
                                    className="p-1.5 text-danger-600 hover:bg-danger-400/10 rounded-lg"
                                    title="Reddet">
                                    <XCircleIcon className="w-5 h-5" />
                                </Button>
                            </>
                        )}
                        {(review.status === 'approved' || review.status === 'pending') && (
                            <Button variant="secondary" onClick={() => handleStatusUpdate(review.id, 'spam')}
                                className="p-1.5 text-warning-700 hover:bg-warning-400/10 rounded-lg"
                                title="Spam Olarak İşaretle">
                                <ExclamationTriangleIcon className="w-5 h-5" />
                            </Button>
                        )}
                        <Button variant="secondary" onClick={() => setDeleteConfirm(review.id)}
                            className="p-1.5 text-muted hover:text-danger-600 hover:bg-danger-400/10 rounded-lg"
                            title="Sil">
                            <TrashIcon className="w-5 h-5" />
                        </Button>
                    </div>
                );
            },
        },
    ];

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-heading">Yorumlar</h1>
                        <p className="text-muted mt-1">Ürün ve satıcı yorumlarını yönetin</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {activeTab === 'product' && (
                            <Select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="w-auto"
                                selectSize="sm"
                            >
                                <option value="">Tüm Durumlar</option>
                                <option value="pending">Bekleyenler</option>
                                <option value="approved">Onaylananlar</option>
                                <option value="rejected">Reddedilenler</option>
                                <option value="spam">Spam</option>
                            </Select>
                        )}
                        {activeTab === 'seller' && (
                            <>
                                <Select
                                    value={sellerStatusFilter}
                                    onChange={(e) => { setSellerStatusFilter(e.target.value); setSellerPage(1); }}
                                    className="w-auto"
                                    selectSize="sm"
                                >
                                    <option value="">Tüm Durumlar</option>
                                    <option value="pending">Bekleyenler</option>
                                    <option value="approved">Onaylananlar</option>
                                    <option value="rejected">Reddedilenler</option>
                                    <option value="spam">Spam</option>
                                </Select>
                                <Input type="text"
                                    value={sellerSearch}
                                    onChange={(e) => { setSellerSearch(e.target.value); setSellerPage(1); }}
                                    placeholder="Kullanıcı ara..."
                                    className="border-border text-heading" />
                            </>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <AdminTabs
                    tabs={[
                        { key: 'product', label: 'Ürün Yorumları' },
                        { key: 'seller', label: 'Satıcı Yorumları' },
                    ]}
                    value={activeTab}
                    onChange={(k) => setActiveTab(k as 'product' | 'seller')}
                />

                {/* Product Reviews List */}
                {activeTab === 'seller' ? (
                <div>
                    <DataTable
                        columns={sellerColumns}
                        data={sellerRatings}
                        loading={sellerLoading}
                        emptyText="Satıcı yorumu bulunamadı"
                        getRowId={(r) => r.id}
                    />
                    {sellerTotalPages > 1 && (
                        <div className="flex justify-center mt-6 gap-2">
                            <Button variant="secondary" onClick={() => setSellerPage(p => Math.max(1, p - 1))} disabled={sellerPage === 1} className="px-3 py-1 bg-surface-alt text-heading rounded disabled:opacity-50">Önceki</Button>
                            <span className="px-3 py-1 text-muted">Sayfa {sellerPage} / {sellerTotalPages}</span>
                            <Button variant="secondary" onClick={() => setSellerPage(p => Math.min(sellerTotalPages, p + 1))} disabled={sellerPage === sellerTotalPages} className="px-3 py-1 bg-surface-alt text-heading rounded disabled:opacity-50">Sonraki</Button>
                        </div>
                    )}
                </div>
                ) : (
                <div>
                    <DataTable
                        columns={productColumns}
                        data={reviews}
                        loading={loading}
                        emptyText="Yorum bulunamadı"
                        getRowId={(r) => r.id}
                    />

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center mt-6 gap-2">
                            <Button variant="secondary" onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 bg-surface-alt text-heading rounded disabled:opacity-50">
                                Önceki
                            </Button>
                            <span className="px-3 py-1 text-muted">
                                Sayfa {page} / {totalPages}
                            </span>
                            <Button variant="secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 bg-surface-alt text-heading rounded disabled:opacity-50">
                                Sonraki
                            </Button>
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* Delete Seller Rating Confirmation */}
            {deleteSellerConfirm && (
                <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50">
                    <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4 border border-border">
                        <h3 className="text-lg font-semibold text-heading mb-4">Satıcı Yorumunu Sil</h3>
                        <p className="text-muted mb-6">Bu satıcı yorumunu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
                        <div className="flex gap-3">
                            <Button variant="secondary" size="md" onClick={() => setDeleteSellerConfirm(null)} className="flex-1">İptal</Button>
                            <Button variant="danger" size="md" onClick={() => handleDeleteSellerRating(deleteSellerConfirm)} className="flex-1">Sil</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50">
                    <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4 border border-border">
                        <h3 className="text-lg font-semibold text-heading mb-4">Yorumu Sil</h3>
                        <p className="text-muted mb-6">
                            Bu yorumu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="secondary" size="md" onClick={() => setDeleteConfirm(null)} className="flex-1">
                                İptal
                            </Button>
                            <Button variant="danger" size="md" onClick={() => handleDelete(deleteConfirm)} className="flex-1">
                                Sil
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
