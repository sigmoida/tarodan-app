'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
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
            <div className="flex text-yellow-500">
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

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
                return <span className="badge badge-success">Onaylı</span>;
            case 'pending':
                return <span className="badge badge-warning">Bekliyor</span>;
            case 'rejected':
                return <span className="badge badge-danger">Reddedildi</span>;
            case 'spam':
                return <span className="badge badge-gray">Spam</span>;
            default:
                return <span className="badge badge-gray">{status}</span>;
        }
    };

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Yorumlar</h1>
                        <p className="text-gray-500 mt-1">Ürün ve satıcı yorumlarını yönetin</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {activeTab === 'product' && (
                            <select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value);
                                    setPage(1);
                                }}
                                className="bg-white border border-gray-200 text-gray-900 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                            >
                                <option value="">Tüm Durumlar</option>
                                <option value="pending">Bekleyenler</option>
                                <option value="approved">Onaylananlar</option>
                                <option value="rejected">Reddedilenler</option>
                                <option value="spam">Spam</option>
                            </select>
                        )}
                        {activeTab === 'seller' && (
                            <>
                                <select
                                    value={sellerStatusFilter}
                                    onChange={(e) => { setSellerStatusFilter(e.target.value); setSellerPage(1); }}
                                    className="bg-white border border-gray-200 text-gray-900 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">Tüm Durumlar</option>
                                    <option value="pending">Bekleyenler</option>
                                    <option value="approved">Onaylananlar</option>
                                    <option value="rejected">Reddedilenler</option>
                                    <option value="spam">Spam</option>
                                </select>
                                <input
                                    type="text"
                                    value={sellerSearch}
                                    onChange={(e) => { setSellerSearch(e.target.value); setSellerPage(1); }}
                                    placeholder="Kullanıcı ara..."
                                    className="bg-white border border-gray-200 text-gray-900 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                                />
                            </>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('product')}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'product' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Ürün Yorumları
                    </button>
                    <button
                        onClick={() => setActiveTab('seller')}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'seller' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Satıcı Yorumları
                    </button>
                </div>

                {/* Product Reviews List */}
                {activeTab === 'seller' ? (
                <div className="admin-card overflow-hidden">
                    {sellerLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                            <p className="text-gray-500 mt-4">Yükleniyor...</p>
                        </div>
                    ) : sellerRatings.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">Satıcı yorumu bulunamadı</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Gönderen</th>
                                        <th>Alıcı (Satıcı)</th>
                                        <th>Puan</th>
                                        <th>Yorum</th>
                                        <th>Durum</th>
                                        <th>Kaynak</th>
                                        <th>Tarih</th>
                                        <th className="text-right">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sellerRatings.map((r) => (
                                        <tr key={r.id}>
                                            <td>
                                                <p className="text-sm text-gray-900">{r.giver.displayName}</p>
                                                <p className="text-xs text-gray-500">{r.giver.email}</p>
                                            </td>
                                            <td>
                                                <p className="text-sm text-gray-900">{r.receiver.displayName}</p>
                                                <p className="text-xs text-gray-500">{r.receiver.email}</p>
                                            </td>
                                            <td>{renderStars(r.score)}</td>
                                            <td className="max-w-xs">
                                                <p className="text-sm text-gray-600 line-clamp-3">{r.comment || '-'}</p>
                                            </td>
                                            <td>{getStatusBadge(r.status || 'approved')}</td>
                                            <td>
                                                <span className="text-xs text-gray-500">
                                                    {r.orderId ? 'Sipariş' : r.tradeId ? 'Takas' : '-'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-sm text-gray-500">
                                                    {format(new Date(r.createdAt), 'dd MMM yyyy', { locale: tr })}
                                                </span>
                                            </td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {(r.status === 'pending' || !r.status) && (
                                                        <>
                                                            <button
                                                                onClick={() => handleSellerStatusUpdate(r.id, 'approved')}
                                                                className="p-1.5 text-green-700 hover:bg-green-400/10 rounded-lg"
                                                                title="Onayla"
                                                            >
                                                                <CheckCircleIcon className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleSellerStatusUpdate(r.id, 'rejected')}
                                                                className="p-1.5 text-red-600 hover:bg-red-400/10 rounded-lg"
                                                                title="Reddet"
                                                            >
                                                                <XCircleIcon className="w-5 h-5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDeleteSellerConfirm(r.id); }}
                                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-400/10 rounded-lg"
                                                        title="Sil"
                                                    >
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {sellerTotalPages > 1 && (
                        <div className="flex justify-center mt-6 gap-2">
                            <button onClick={() => setSellerPage(p => Math.max(1, p - 1))} disabled={sellerPage === 1} className="px-3 py-1 bg-gray-100 text-gray-900 rounded disabled:opacity-50">Önceki</button>
                            <span className="px-3 py-1 text-gray-500">Sayfa {sellerPage} / {sellerTotalPages}</span>
                            <button onClick={() => setSellerPage(p => Math.min(sellerTotalPages, p + 1))} disabled={sellerPage === sellerTotalPages} className="px-3 py-1 bg-gray-100 text-gray-900 rounded disabled:opacity-50">Sonraki</button>
                        </div>
                    )}
                </div>
                ) : (
                <div className="admin-card overflow-hidden">
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                            <p className="text-gray-500 mt-4">Yükleniyor...</p>
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            Yorum bulunamadı
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Ürün</th>
                                        <th>Kullanıcı</th>
                                        <th>Değerlendirme</th>
                                        <th>Durum</th>
                                        <th>Tarih</th>
                                        <th className="text-right">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reviews.map((review) => (
                                        <tr key={review.id}>
                                            <td className="w-64">
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
                                                        <div className="w-10 h-10 bg-gray-100 rounded flex-shrink-0" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]" title={review.product.title}>
                                                            {review.product.title}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 text-primary-600 font-bold text-xs">
                                                        {review.user.displayName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-gray-900">{review.user.displayName}</p>
                                                        {review.isVerifiedPurchase && (
                                                            <span className="text-[10px] text-green-700 flex items-center gap-1">
                                                                <CheckCircleIcon className="w-3 h-3" />
                                                                Onaylı Alıcı
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="max-w-md">
                                                <div className="space-y-1">
                                                    {renderStars(review.score)}
                                                    {review.title && <p className="font-medium text-gray-900 text-sm">{review.title}</p>}
                                                    {review.review && <p className="text-gray-500 text-sm line-clamp-3">{review.review}</p>}
                                                    {review.adminReply && (
                                                        <div className="mt-2 pl-3 border-l-2 border-primary-500">
                                                            <p className="text-xs text-primary-400 font-medium">Satıcı Yanıtı:</p>
                                                            <p className="text-xs text-gray-500">{review.adminReply}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>{getStatusBadge(review.status)}</td>
                                            <td>
                                                <span className="text-sm text-gray-500">
                                                    {format(new Date(review.createdAt), 'dd MMM yyyy', { locale: tr })}
                                                </span>
                                            </td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {review.status === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusUpdate(review.id, 'approved')}
                                                                className="p-1.5 text-green-700 hover:bg-green-400/10 rounded-lg"
                                                                title="Onayla"
                                                            >
                                                                <CheckCircleIcon className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(review.id, 'rejected')}
                                                                className="p-1.5 text-red-600 hover:bg-red-400/10 rounded-lg"
                                                                title="Reddet"
                                                            >
                                                                <XCircleIcon className="w-5 h-5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {(review.status === 'approved' || review.status === 'pending') && (
                                                        <button
                                                            onClick={() => handleStatusUpdate(review.id, 'spam')}
                                                            className="p-1.5 text-yellow-700 hover:bg-yellow-400/10 rounded-lg"
                                                            title="Spam Olarak İşaretle"
                                                        >
                                                            <ExclamationTriangleIcon className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setDeleteConfirm(review.id)}
                                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-400/10 rounded-lg"
                                                        title="Sil"
                                                    >
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center mt-6 gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 bg-gray-100 text-gray-900 rounded disabled:opacity-50"
                            >
                                Önceki
                            </button>
                            <span className="px-3 py-1 text-gray-500">
                                Sayfa {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 bg-gray-100 text-gray-900 rounded disabled:opacity-50"
                            >
                                Sonraki
                            </button>
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* Delete Seller Rating Confirmation */}
            {deleteSellerConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Satıcı Yorumunu Sil</h3>
                        <p className="text-gray-500 mb-6">Bu satıcı yorumunu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteSellerConfirm(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100">İptal</button>
                            <button onClick={() => handleDeleteSellerRating(deleteSellerConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-gray-900 rounded-lg hover:bg-red-700">Sil</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Yorumu Sil</h3>
                        <p className="text-gray-500 mb-6">
                            Bu yorumu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100"
                            >
                                İptal
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-600 text-gray-900 rounded-lg hover:bg-red-700"
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
