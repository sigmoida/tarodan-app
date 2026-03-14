'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import {
    BellIcon,
    PaperAirplaneIcon,
    ClockIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface NotificationLog {
    id: string;
    userId: string;
    channel: string;
    type: string;
    title: string;
    body: string;
    status: string;
    createdAt: string;
    user?: {
        displayName: string;
        email: string;
    };
}

interface ScheduledNotification {
    id: string;
    title: string;
    body: string;
    channels: string[];
    targetType: string;
    scheduledFor: string;
    status: string;
    createdAt: string;
}

type TabType = 'send' | 'scheduled' | 'history';

export default function NotificationsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('send');

    // Send notification state
    const [sendForm, setSendForm] = useState({
        title: '',
        body: '',
        channels: ['push'] as string[],
        targetType: 'all' as 'all' | 'segment' | 'user_ids',
        userIds: '',
        isSeller: undefined as boolean | undefined,
        membershipTier: '',
    });
    const [sending, setSending] = useState(false);

    // Scheduled notifications state
    const [scheduled, setScheduled] = useState<ScheduledNotification[]>([]);
    const [loadingScheduled, setLoadingScheduled] = useState(false);

    // History state
    const [history, setHistory] = useState<NotificationLog[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyFilters, setHistoryFilters] = useState({
        page: 1,
        limit: 20,
        channel: '',
        status: '',
    });
    const [totalHistory, setTotalHistory] = useState(0);

    // Schedule modal state
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduling, setScheduling] = useState(false);

    const loadScheduled = useCallback(async () => {
        setLoadingScheduled(true);
        try {
            const response = await adminApi.getScheduledNotifications({ status: 'pending' });
            setScheduled(response.data?.data || []);
        } catch (error: any) {
            toast.error('Zamanlanmış bildirimler yüklenemedi');
        } finally {
            setLoadingScheduled(false);
        }
    }, []);

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const response = await adminApi.getNotificationHistory({
                page: historyFilters.page,
                limit: historyFilters.limit,
                channel: historyFilters.channel || undefined,
                status: historyFilters.status || undefined,
            });
            setHistory(response.data?.data || []);
            setTotalHistory(response.data?.meta?.total || 0);
        } catch (error: any) {
            toast.error('Bildirim geçmişi yüklenemedi');
        } finally {
            setLoadingHistory(false);
        }
    }, [historyFilters]);

    useEffect(() => {
        if (activeTab === 'scheduled') loadScheduled();
        if (activeTab === 'history') loadHistory();
    }, [activeTab, loadScheduled, loadHistory]);

    const handleSendNotification = async () => {
        if (!sendForm.title || !sendForm.body) {
            toast.error('Başlık ve içerik zorunludur');
            return;
        }

        if (sendForm.channels.length === 0) {
            toast.error('En az bir kanal seçmelisiniz');
            return;
        }

        const data: any = {
            title: sendForm.title,
            body: sendForm.body,
            channels: sendForm.channels,
            targetType: sendForm.targetType,
        };

        if (sendForm.targetType === 'user_ids') {
            data.userIds = sendForm.userIds.split(',').map(s => s.trim()).filter(Boolean);
            if (data.userIds.length === 0) {
                toast.error('En az bir kullanıcı ID girin');
                return;
            }
        }

        if (sendForm.targetType === 'segment') {
            data.segmentCriteria = {};
            if (sendForm.isSeller !== undefined) data.segmentCriteria.isSeller = sendForm.isSeller;
            if (sendForm.membershipTier) data.segmentCriteria.membershipTier = sendForm.membershipTier;
        }

        setSending(true);
        try {
            const response = await adminApi.sendNotification(data);
            toast.success(response.data?.message || 'Bildirim gönderildi');
            setSendForm({
                title: '',
                body: '',
                channels: ['push'],
                targetType: 'all',
                userIds: '',
                isSeller: undefined,
                membershipTier: '',
            });
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Gönderim başarısız');
        } finally {
            setSending(false);
        }
    };

    const handleScheduleNotification = async () => {
        if (!scheduleDate) {
            toast.error('Tarih seçmelisiniz');
            return;
        }

        const data: any = {
            title: sendForm.title,
            body: sendForm.body,
            channels: sendForm.channels,
            targetType: sendForm.targetType,
            scheduledFor: new Date(scheduleDate).toISOString(),
        };

        if (sendForm.targetType === 'user_ids') {
            data.userIds = sendForm.userIds.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (sendForm.targetType === 'segment') {
            data.segmentCriteria = {};
            if (sendForm.isSeller !== undefined) data.segmentCriteria.isSeller = sendForm.isSeller;
            if (sendForm.membershipTier) data.segmentCriteria.membershipTier = sendForm.membershipTier;
        }

        setScheduling(true);
        try {
            await adminApi.scheduleNotification(data);
            toast.success('Bildirim zamanlandı');
            setShowScheduleModal(false);
            setScheduleDate('');
            loadScheduled();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Zamanlama başarısız');
        } finally {
            setScheduling(false);
        }
    };

    const handleCancelScheduled = async (id: string) => {
        if (!confirm('Bu zamanlanmış bildirimi iptal etmek istiyor musunuz?')) return;

        try {
            await adminApi.cancelScheduledNotification(id);
            toast.success('Bildirim iptal edildi');
            loadScheduled();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'İptal başarısız');
        }
    };

    const toggleChannel = (channel: string) => {
        setSendForm(prev => ({
            ...prev,
            channels: prev.channels.includes(channel)
                ? prev.channels.filter(c => c !== channel)
                : [...prev.channels, channel]
        }));
    };

    const tabs = [
        { key: 'send', label: 'Bildirim Gönder', icon: PaperAirplaneIcon },
        { key: 'scheduled', label: 'Zamanlanmış', icon: ClockIcon },
        { key: 'history', label: 'Geçmiş', icon: BellIcon },
    ];

    return (
        <>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bildirim Yönetimi</h1>
                    <p className="text-gray-500 mt-1">Push, email ve SMS bildirimleri gönderin ve yönetin</p>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as TabType)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${activeTab === tab.key
                                    ? 'bg-primary-500 text-gray-900'
                                    : 'bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                        >
                            <tab.icon className="h-5 w-5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Send Tab */}
                {activeTab === 'send' && (
                    <div className="admin-card p-6 max-w-2xl">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Başlık *</label>
                                <input
                                    type="text"
                                    value={sendForm.title}
                                    onChange={(e) => setSendForm({ ...sendForm, title: e.target.value })}
                                    className="admin-input"
                                    placeholder="Bildirim başlığı"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">İçerik *</label>
                                <textarea
                                    value={sendForm.body}
                                    onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })}
                                    className="admin-input"
                                    rows={4}
                                    placeholder="Bildirim içeriği"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Kanallar</label>
                                <div className="flex gap-4">
                                    {['push', 'email', 'sms'].map(channel => (
                                        <label key={channel} className="flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={sendForm.channels.includes(channel)}
                                                onChange={() => toggleChannel(channel)}
                                                className="h-4 w-4 rounded border-gray-300 bg-gray-100 text-primary-600 mr-2"
                                            />
                                            <span className="text-gray-600 capitalize">{channel}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Hedef</label>
                                <select
                                    value={sendForm.targetType}
                                    onChange={(e) => setSendForm({ ...sendForm, targetType: e.target.value as any })}
                                    className="admin-input"
                                >
                                    <option value="all">Tüm Kullanıcılar</option>
                                    <option value="segment">Segment</option>
                                    <option value="user_ids">Belirli Kullanıcılar</option>
                                </select>
                            </div>

                            {sendForm.targetType === 'user_ids' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Kullanıcı ID'leri (virgülle ayırın)</label>
                                    <input
                                        type="text"
                                        value={sendForm.userIds}
                                        onChange={(e) => setSendForm({ ...sendForm, userIds: e.target.value })}
                                        className="admin-input"
                                        placeholder="uuid1, uuid2, uuid3"
                                    />
                                </div>
                            )}

                            {sendForm.targetType === 'segment' && (
                                <div className="space-y-4 p-4 bg-gray-100 rounded-lg">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-2">Satıcı Durumu</label>
                                        <select
                                            value={sendForm.isSeller === undefined ? '' : sendForm.isSeller ? 'true' : 'false'}
                                            onChange={(e) => setSendForm({ ...sendForm, isSeller: e.target.value === '' ? undefined : e.target.value === 'true' })}
                                            className="admin-input"
                                        >
                                            <option value="">Hepsi</option>
                                            <option value="true">Sadece Satıcılar</option>
                                            <option value="false">Sadece Alıcılar</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-2">Üyelik Tipi</label>
                                        <select
                                            value={sendForm.membershipTier}
                                            onChange={(e) => setSendForm({ ...sendForm, membershipTier: e.target.value })}
                                            className="admin-input"
                                        >
                                            <option value="">Hepsi</option>
                                            <option value="free">Free</option>
                                            <option value="premium">Premium</option>
                                            <option value="business">Business</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={handleSendNotification}
                                    disabled={sending}
                                    className="btn-primary disabled:opacity-50"
                                >
                                    <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                                    {sending ? 'Gönderiliyor...' : 'Şimdi Gönder'}
                                </button>
                                <button
                                    onClick={() => setShowScheduleModal(true)}
                                    disabled={!sendForm.title || !sendForm.body}
                                    className="btn-secondary disabled:opacity-50"
                                >
                                    <ClockIcon className="h-5 w-5 mr-2" />
                                    Zamanla
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scheduled Tab */}
                {activeTab === 'scheduled' && (
                    <div className="admin-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Başlık</th>
                                        <th>Kanallar</th>
                                        <th>Hedef</th>
                                        <th>Tarih</th>
                                        <th>Durum</th>
                                        <th>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingScheduled ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-8">
                                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                                            </td>
                                        </tr>
                                    ) : scheduled.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-8 text-gray-500">Zamanlanmış bildirim yok</td></tr>
                                    ) : (
                                        scheduled.map((item) => (
                                            <tr key={item.id}>
                                                <td className="font-medium text-gray-900">{item.title}</td>
                                                <td className="text-gray-500">{item.channels?.join(', ')}</td>
                                                <td className="text-gray-500">{item.targetType}</td>
                                                <td className="text-gray-500">
                                                    {new Date(item.scheduledFor).toLocaleString('tr-TR')}
                                                </td>
                                                <td>
                                                    <span className="badge badge-warning">{item.status}</span>
                                                </td>
                                                <td>
                                                    <button
                                                        onClick={() => handleCancelScheduled(item.id)}
                                                        className="p-2 text-red-600 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                                    >
                                                        <XCircleIcon className="h-5 w-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                    <div className="space-y-4">
                        <div className="flex gap-4 items-center">
                            <select
                                value={historyFilters.channel}
                                onChange={(e) => setHistoryFilters({ ...historyFilters, channel: e.target.value, page: 1 })}
                                className="admin-input w-48"
                            >
                                <option value="">Tüm Kanallar</option>
                                <option value="push">Push</option>
                                <option value="email">Email</option>
                                <option value="sms">SMS</option>
                            </select>
                            <select
                                value={historyFilters.status}
                                onChange={(e) => setHistoryFilters({ ...historyFilters, status: e.target.value, page: 1 })}
                                className="admin-input w-48"
                            >
                                <option value="">Tüm Durumlar</option>
                                <option value="pending">Beklemede</option>
                                <option value="sent">Gönderildi</option>
                                <option value="delivered">Teslim Edildi</option>
                                <option value="failed">Başarısız</option>
                            </select>
                        </div>

                        <div className="admin-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Kullanıcı</th>
                                            <th>Kanal</th>
                                            <th>Başlık</th>
                                            <th>Durum</th>
                                            <th>Tarih</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingHistory ? (
                                            <tr>
                                                <td colSpan={5} className="text-center py-8">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                                                </td>
                                            </tr>
                                        ) : history.length === 0 ? (
                                            <tr><td colSpan={5} className="text-center py-8 text-gray-500">Bildirim geçmişi boş</td></tr>
                                        ) : (
                                            history.map((log) => (
                                                <tr key={log.id}>
                                                    <td className="text-gray-900">{log.user?.displayName || log.userId}</td>
                                                    <td className="text-gray-500 uppercase">{log.channel}</td>
                                                    <td className="text-gray-900">{log.title}</td>
                                                    <td>
                                                        <span className={`badge ${log.status === 'sent' || log.status === 'delivered'
                                                                ? 'badge-success'
                                                                : log.status === 'failed'
                                                                    ? 'badge-danger'
                                                                    : 'badge-warning'
                                                            }`}>
                                                            {log.status}
                                                        </span>
                                                    </td>
                                                    <td className="text-gray-500">
                                                        {new Date(log.createdAt).toLocaleString('tr-TR')}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination */}
                        {totalHistory > historyFilters.limit && (
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-500">
                                    Sayfa {historyFilters.page} / {Math.ceil(totalHistory / historyFilters.limit)}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setHistoryFilters({ ...historyFilters, page: historyFilters.page - 1 })}
                                        disabled={historyFilters.page === 1}
                                        className="btn-secondary disabled:opacity-50"
                                    >
                                        Önceki
                                    </button>
                                    <button
                                        onClick={() => setHistoryFilters({ ...historyFilters, page: historyFilters.page + 1 })}
                                        disabled={historyFilters.page >= Math.ceil(totalHistory / historyFilters.limit)}
                                        className="btn-secondary disabled:opacity-50"
                                    >
                                        Sonraki
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Schedule Modal */}
            {showScheduleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Bildirimi Zamanla</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">Gönderim Tarihi ve Saati</label>
                                <input
                                    type="datetime-local"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    min={new Date().toISOString().slice(0, 16)}
                                    className="admin-input"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleModal(false)}
                                    className="btn-secondary"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={handleScheduleNotification}
                                    disabled={scheduling || !scheduleDate}
                                    className="btn-primary disabled:opacity-50"
                                >
                                    {scheduling ? 'Kaydediliyor...' : 'Zamanla'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
