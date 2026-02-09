'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import {
    CheckCircleIcon,
    XCircleIcon,
    TrashIcon,
    ChatBubbleLeftRightIcon,
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

export default function ReviewsPage() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Modal states
    const [replyModalOpen, setReplyModalOpen] = useState(false);
    const [selectedReview, setSelectedReview] = useState<Review | null>(null);
    const [replyText, setReplyText] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        loadReviews();
    }, [page, statusFilter]);

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

    const handleReplySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedReview) return;

        try {
            await adminApi.replyToReview(selectedReview.id, replyText);
            toast.success('Yanıt gönderildi');
            setReplyModalOpen(false);
            setReplyText('');
            setSelectedReview(null);
            loadReviews();
        } catch (error: any) {
            toast.error('Yanıt gönderilemedi');
        }
    };

    const openReplyModal = (review: Review) => {
        setSelectedReview(review);
        setReplyText(review.adminReply || '');
        setReplyModalOpen(true);
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
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Ürün Yorumları</h1>
                        <p className="text-gray-400 mt-1">Kullanıcı geri bildirimlerini yönetin</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value);
                                setPage(1);
                            }}
                            className="bg-dark-800 border border-dark-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Tüm Durumlar</option>
                            <option value="pending">Bekleyenler</option>
                            <option value="approved">Onaylananlar</option>
                            <option value="rejected">Reddedilenler</option>
                            <option value="spam">Spam</option>
                        </select>
                    </div>
                </div>

                {/* Reviews List */}
                <div className="admin-card overflow-hidden">
                    {loading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                            <p className="text-gray-400 mt-4">Yükleniyor...</p>
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
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
                                                        <div className="w-10 h-10 bg-dark-700 rounded flex-shrink-0" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-white truncate max-w-[200px]" title={review.product.title}>
                                                            {review.product.title}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 text-primary-500 font-bold text-xs">
                                                        {review.user.displayName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-white">{review.user.displayName}</p>
                                                        {review.isVerifiedPurchase && (
                                                            <span className="text-[10px] text-green-400 flex items-center gap-1">
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
                                                    {review.title && <p className="font-medium text-white text-sm">{review.title}</p>}
                                                    {review.review && <p className="text-gray-400 text-sm line-clamp-3">{review.review}</p>}
                                                    {review.adminReply && (
                                                        <div className="mt-2 pl-3 border-l-2 border-primary-500">
                                                            <p className="text-xs text-primary-400 font-medium">Satıcı Yanıtı:</p>
                                                            <p className="text-xs text-gray-400">{review.adminReply}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>{getStatusBadge(review.status)}</td>
                                            <td>
                                                <span className="text-sm text-gray-400">
                                                    {format(new Date(review.createdAt), 'dd MMM yyyy', { locale: tr })}
                                                </span>
                                            </td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {review.status === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusUpdate(review.id, 'approved')}
                                                                className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg"
                                                                title="Onayla"
                                                            >
                                                                <CheckCircleIcon className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(review.id, 'rejected')}
                                                                className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg"
                                                                title="Reddet"
                                                            >
                                                                <XCircleIcon className="w-5 h-5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => openReplyModal(review)}
                                                        className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-lg"
                                                        title={review.adminReply ? "Yanıtı Düzenle" : "Yanıtla"}
                                                    >
                                                        <ChatBubbleLeftRightIcon className="w-5 h-5" />
                                                    </button>
                                                    {(review.status === 'approved' || review.status === 'pending') && (
                                                        <button
                                                            onClick={() => handleStatusUpdate(review.id, 'spam')}
                                                            className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded-lg"
                                                            title="Spam Olarak İşaretle"
                                                        >
                                                            <ExclamationTriangleIcon className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setDeleteConfirm(review.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg"
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
                                className="px-3 py-1 bg-dark-700 text-white rounded disabled:opacity-50"
                            >
                                Önceki
                            </button>
                            <span className="px-3 py-1 text-gray-400">
                                Sayfa {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1 bg-dark-700 text-white rounded disabled:opacity-50"
                            >
                                Sonraki
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Reply Modal */}
            {replyModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-dark-800 rounded-xl p-6 max-w-lg w-full mx-4 border border-dark-700">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            Yorumu Yanıtla
                        </h3>
                        {selectedReview && (
                            <div className="mb-4 p-3 bg-dark-700/50 rounded-lg">
                                <p className="text-sm text-gray-300 italic">"{selectedReview.review}"</p>
                            </div>
                        )}
                        <form onSubmit={handleReplySubmit}>
                            <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                className="input-dark w-full h-32 mb-4"
                                placeholder="Yanıtınızı yazın..."
                                required
                            />
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setReplyModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-dark-600 text-gray-300 rounded-lg hover:bg-dark-700"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                >
                                    Yanıtla
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-dark-800 rounded-xl p-6 max-w-md w-full mx-4 border border-dark-700">
                        <h3 className="text-lg font-semibold text-white mb-4">Yorumu Sil</h3>
                        <p className="text-gray-400 mb-6">
                            Bu yorumu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 border border-dark-600 text-gray-300 rounded-lg hover:bg-dark-700"
                            >
                                İptal
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
