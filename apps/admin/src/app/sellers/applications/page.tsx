'use client';

import { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
    CheckCircleIcon,
    XCircleIcon,
    DocumentTextIcon,
    BuildingOfficeIcon,
    UserIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Mock data based on User model structure
const PENDING_APPLICATIONS = [
    {
        id: '1',
        displayName: 'Teknoloji Dünyası',
        email: 'info@teknodunya.com',
        companyName: 'Tekno Ltd. Şti.',
        taxId: '1234567890',
        appliedAt: '2024-02-09T10:30:00Z',
        type: 'business',
        documents: [
            { name: 'Vergi Levhası', url: '#' },
            { name: 'İmza Sirküleri', url: '#' },
        ],
    },
    {
        id: '2',
        displayName: 'Moda Butik',
        email: 'satis@modabutik.com',
        companyName: 'Moda Giyim A.Ş.',
        taxId: '9876543210',
        appliedAt: '2024-02-08T15:20:00Z',
        type: 'verified',
        documents: [
            { name: 'Kimlik Fotokopisi', url: '#' },
        ],
    },
    {
        id: '3',
        displayName: 'Kitap Kurdu',
        email: 'ali@kitapkurdu.com',
        companyName: null,
        taxId: null,
        appliedAt: '2024-02-07T09:15:00Z',
        type: 'individual',
        documents: [],
    }
];

export default function SellerApplicationsPage() {
    const [applications, setApplications] = useState(PENDING_APPLICATIONS);
    const [selectedApplication, setSelectedApplication] = useState<any>(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    const handleApprove = (id: string) => {
        if (confirm('Bu satıcı başvurusunu onaylamak istediğinize emin misiniz?')) {
            // API call would go here
            setApplications(prev => prev.filter(app => app.id !== id));
            toast.success('Satıcı başvurusu onaylandı');
            if (selectedApplication?.id === id) setSelectedApplication(null);
        }
    };

    const openRejectModal = (app: any) => {
        setSelectedApplication(app);
        setRejectReason('');
        setIsRejectModalOpen(true);
    };

    const handleReject = (e: React.FormEvent) => {
        e.preventDefault();
        // API call would go here
        setApplications(prev => prev.filter(app => app.id !== selectedApplication.id));
        toast.success('Satıcı başvurusu reddedildi');
        setIsRejectModalOpen(false);
        setSelectedApplication(null);
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Satıcı Başvuruları</h1>
                    <p className="text-gray-400 mt-1">Bekleyen satıcı doğrulama ve onay taleplerini yönetin</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Applications List */}
                    <div className="lg:col-span-1 space-y-4">
                        {applications.length === 0 ? (
                            <div className="admin-card text-center py-8 text-gray-400">
                                Bekleyen başvuru yok
                            </div>
                        ) : (
                            applications.map((app) => (
                                <div
                                    key={app.id}
                                    onClick={() => setSelectedApplication(app)}
                                    className={`admin-card cursor-pointer transition-all hover:bg-dark-700 ${selectedApplication?.id === app.id ? 'border-primary-500 ring-1 ring-primary-500' : ''
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${app.type === 'business' ? 'bg-purple-500/10 text-purple-400' :
                                                app.type === 'verified' ? 'bg-blue-500/10 text-blue-400' :
                                                    'bg-green-500/10 text-green-400'
                                            }`}>
                                            {app.type === 'business' ? 'Kurumsal' : app.type === 'verified' ? 'Onaylı Satıcı' : 'Bireysel'}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {new Date(app.appliedAt).toLocaleDateString('tr-TR')}
                                        </span>
                                    </div>
                                    <h3 className="font-semibold text-white">{app.displayName}</h3>
                                    <p className="text-sm text-gray-400">{app.email}</p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Application Detail */}
                    <div className="lg:col-span-2">
                        {selectedApplication ? (
                            <div className="admin-card h-full">
                                <div className="flex justify-between items-start mb-6 border-b border-dark-700 pb-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">{selectedApplication.displayName}</h2>
                                        <p className="text-gray-400">{selectedApplication.email}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => openRejectModal(selectedApplication)}
                                            className="px-4 py-2 border border-red-500/50 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center"
                                        >
                                            <XCircleIcon className="w-5 h-5 mr-2" />
                                            Reddet
                                        </button>
                                        <button
                                            onClick={() => handleApprove(selectedApplication.id)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center"
                                        >
                                            <CheckCircleIcon className="w-5 h-5 mr-2" />
                                            Onayla
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">Başvuru Bilgileri</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs text-gray-500 block">Başvuru Tipi</label>
                                                <p className="text-white font-medium capitalize">{selectedApplication.type}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 block">Başvuru Tarihi</label>
                                                <p className="text-white font-medium">
                                                    {new Date(selectedApplication.appliedAt).toLocaleString('tr-TR')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">Firma Bilgileri</h3>
                                        {selectedApplication.companyName ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-xs text-gray-500 block flex items-center gap-1">
                                                        <BuildingOfficeIcon className="w-4 h-4" /> Firma Adı
                                                    </label>
                                                    <p className="text-white font-medium">{selectedApplication.companyName}</p>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500 block">Vergi Numarası</label>
                                                    <p className="text-white font-medium">{selectedApplication.taxId}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-gray-400 italic">Bireysel satıcı başvurusu - firma bilgisi yok.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <h3 className="text-sm font-medium text-gray-500 uppercase mb-4">Belgeler</h3>
                                    {selectedApplication.documents.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {selectedApplication.documents.map((doc: any, idx: number) => (
                                                <a
                                                    key={idx}
                                                    href={doc.url}
                                                    className="flex items-center p-3 bg-dark-700/50 hover:bg-dark-700 border border-dark-600 rounded-lg transition-colors group"
                                                >
                                                    <DocumentTextIcon className="w-8 h-8 text-primary-500 mr-3 group-hover:text-primary-400" />
                                                    <div>
                                                        <p className="text-sm font-medium text-white group-hover:text-primary-400 transition-colors">{doc.name}</p>
                                                        <p className="text-xs text-gray-500">Görüntülemek için tıklayın</p>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-gray-400 italic">Bu başvuru için yüklenen belge bulunmamaktadır.</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="admin-card h-full flex flex-col items-center justify-center text-center p-12 opacity-50">
                                <UserIcon className="w-16 h-16 text-gray-600 mb-4" />
                                <h3 className="text-xl font-medium text-gray-300">Başvuru Seçin</h3>
                                <p className="text-gray-500">Detayları görüntülemek için soldaki listeden bir başvuru seçin.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Reject Modal */}
                {isRejectModalOpen && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-dark-800 rounded-xl max-w-md w-full border border-dark-700 shadow-2xl">
                            <div className="p-6">
                                <h3 className="text-xl font-bold text-white mb-4">Başvuruyu Reddet</h3>
                                <form onSubmit={handleReject}>
                                    <div className="mb-6">
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Red Nedeni</label>
                                        <textarea
                                            required
                                            value={rejectReason}
                                            onChange={(e) => setRejectReason(e.target.value)}
                                            className="admin-input w-full"
                                            rows={4}
                                            placeholder="Lütfen reddetme nedenini açıklayın (bu kullanıcıya gönderilecek)"
                                        />
                                    </div>
                                    <div className="flex gap-3 justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setIsRejectModalOpen(false)}
                                            className="btn-secondary"
                                        >
                                            İptal
                                        </button>
                                        <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                                            Reddet
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
