'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import clsx from 'clsx';
import {
    ExclamationTriangleIcon,
    ShieldExclamationIcon,
    EnvelopeIcon,
    MagnifyingGlassIcon,
    CheckCircleIcon,
    ClockIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

type LogTab = 'errors' | 'security' | 'emails';

interface ErrorLog {
    id: string;
    severity: string;
    message: string;
    stackTrace?: string;
    source: string;
    endpoint?: string;
    userId?: string;
    requestId?: string;
    createdAt: string;
}

interface SecurityLog {
    id: string;
    eventType: string;
    severity: string;
    userId?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    location?: string;
    details?: Record<string, any>;
    resolved: boolean;
    resolvedBy?: string;
    resolvedAt?: string;
    createdAt: string;
}

interface EmailLog {
    id: string;
    messageId?: string;
    to: string;
    from: string;
    subject: string;
    template?: string;
    status: string;
    provider: string;
    userId?: string;
    errorMessage?: string;
    sentAt?: string;
    deliveredAt?: string;
    bouncedAt?: string;
    openedAt?: string;
    clickedAt?: string;
    createdAt: string;
}

const tabs = [
    { id: 'errors' as LogTab, name: 'Hata Logları', icon: ExclamationTriangleIcon },
    { id: 'security' as LogTab, name: 'Güvenlik Logları', icon: ShieldExclamationIcon },
    { id: 'emails' as LogTab, name: 'E-posta Logları', icon: EnvelopeIcon },
];

const severityColors: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-600 border-red-500/20',
    high: 'bg-red-500/10 text-red-600 border-red-500/20',
    error: 'bg-red-500/10 text-red-600 border-red-500/20',
    medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    warning: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
    low: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
};

const statusColors: Record<string, string> = {
    sent: 'bg-green-500/10 text-green-700',
    delivered: 'bg-green-500/10 text-green-700',
    queued: 'bg-yellow-500/10 text-yellow-700',
    bounced: 'bg-red-500/10 text-red-600',
    failed: 'bg-red-500/10 text-red-600',
};

const eventTypeLabels: Record<string, string> = {
    failed_login: 'Başarısız Giriş',
    ip_block: 'IP Engelleme',
    suspicious_activity: 'Şüpheli Aktivite',
    password_reset: 'Şifre Sıfırlama',
    '2fa_enabled': '2FA Aktif',
    account_locked: 'Hesap Kilitlendi',
};

export default function LogsPage() {
    const [activeTab, setActiveTab] = useState<LogTab>('errors');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [logs, setLogs] = useState<any[]>([]);
    const [meta, setMeta] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [filters, setFilters] = useState<Record<string, string>>({});

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            let response;
            const params = { page, limit: 20, search, ...filters };

            switch (activeTab) {
                case 'errors':
                    response = await adminApi.getErrorLogs(params);
                    break;
                case 'security':
                    response = await adminApi.getSecurityLogs(params);
                    break;
                case 'emails':
                    response = await adminApi.getEmailLogs(params);
                    break;
            }

            if (response && response.data) {
                setLogs(response.data.data || []);
                setMeta(response.data.meta || null);
                setStats(response.data.stats || null);
            }
        } catch (error: any) {
            toast.error('Loglar yüklenirken bir hata oluştu');
            console.error('Load logs error:', error);
        } finally {
            setLoading(false);
        }
    }, [activeTab, page, search, filters]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const handleResolve = async (id: string) => {
        try {
            await adminApi.resolveSecurityIssue(id);
            toast.success('Sorun çözümlendi');
            loadLogs();
        } catch (error: any) {
            toast.error('İşlem başarısız');
        }
    };

    const handleTabChange = (tab: LogTab) => {
        setActiveTab(tab);
        setPage(1);
        setSearch('');
        setFilters({});
        setLogs([]);
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <>
            <div className="p-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Sistem Logları</h1>
                    <p className="text-gray-500 mt-1">Hata, güvenlik ve e-posta loglarını inceleyin</p>
                </div>

                {/* Tabs */}
                <div className="flex space-x-1 mb-6 bg-white p-1 rounded-lg w-fit">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={clsx(
                                'flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors',
                                activeTab === tab.id
                                    ? 'bg-primary-500 text-gray-900'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            )}
                        >
                            <tab.icon className="h-4 w-4 mr-2" />
                            {tab.name}
                        </button>
                    ))}
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        {activeTab === 'errors' && (
                            <>
                                <StatCard label="Kritik" value={stats.critical || 0} color="red" />
                                <StatCard label="Hata" value={stats.error || 0} color="yellow" />
                                <StatCard label="Uyarı" value={stats.warning || 0} color="blue" />
                                <StatCard label="Toplam" value={meta?.total || 0} color="gray" />
                            </>
                        )}
                        {activeTab === 'security' && (
                            <>
                                <StatCard
                                    label="Çözülmemiş Kritik"
                                    value={stats.unresolvedHighSeverity || 0}
                                    color="red"
                                />
                                <StatCard
                                    label="Başarısız Giriş"
                                    value={stats.byEventType?.failed_login || 0}
                                    color="yellow"
                                />
                                <StatCard
                                    label="IP Engelleme"
                                    value={stats.byEventType?.ip_block || 0}
                                    color="blue"
                                />
                                <StatCard label="Toplam" value={meta?.total || 0} color="gray" />
                            </>
                        )}
                        {activeTab === 'emails' && (
                            <>
                                <StatCard
                                    label="Teslim Oranı"
                                    value={`${stats.deliveryRate || 0}%`}
                                    color="green"
                                />
                                <StatCard
                                    label="Bounce Oranı"
                                    value={`${stats.bounceRate || 0}%`}
                                    color="red"
                                />
                                <StatCard
                                    label="Gönderilen"
                                    value={stats.byStatus?.sent || 0}
                                    color="blue"
                                />
                                <StatCard label="Toplam" value={meta?.total || 0} color="gray" />
                            </>
                        )}
                    </div>
                )}

                {/* Search and Filters */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Ara..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                        />
                    </div>
                    <button
                        onClick={() => loadLogs()}
                        className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900"
                    >
                        <ArrowPathIcon className={clsx('h-5 w-5', loading && 'animate-spin')} />
                    </button>
                </div>

                {/* Content */}
                {loading && logs.length === 0 ? (
                    <div className="flex items-center justify-center h-64">
                        <ArrowPathIcon className="h-8 w-8 text-primary-600 animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Error Logs Table */}
                        {activeTab === 'errors' && (
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seviye</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mesaj</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kaynak</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {logs.length === 0 ? (
                                                <tr><td colSpan={4} className="text-center py-8 text-gray-500">Log bulunamadı</td></tr>
                                            ) : (
                                                logs.map((log: ErrorLog) => (
                                                    <tr key={log.id} className="hover:bg-gray-100/50">
                                                        <td className="px-4 py-3">
                                                            <span className={clsx('px-2 py-1 text-xs rounded-full border', severityColors[log.severity])}>
                                                                {log.severity.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">{log.message}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-500">{log.source}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Security Logs Table */}
                        {activeTab === 'security' && (
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Olay</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seviye</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP / E-posta</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">İşlem</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {logs.length === 0 ? (
                                                <tr><td colSpan={6} className="text-center py-8 text-gray-500">Log bulunamadı</td></tr>
                                            ) : (
                                                logs.map((log: SecurityLog) => (
                                                    <tr key={log.id} className="hover:bg-gray-100/50">
                                                        <td className="px-4 py-3 text-sm text-gray-900">
                                                            {eventTypeLabels[log.eventType] || log.eventType}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={clsx('px-2 py-1 text-xs rounded-full border', severityColors[log.severity])}>
                                                                {log.severity.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-500">
                                                            {log.ipAddress || log.email || '-'}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {log.resolved ? (
                                                                <span className="flex items-center text-green-700 text-sm">
                                                                    <CheckCircleIcon className="h-4 w-4 mr-1" /> Çözüldü
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center text-yellow-700 text-sm">
                                                                    <ClockIcon className="h-4 w-4 mr-1" /> Bekliyor
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                                                        <td className="px-4 py-3">
                                                            {!log.resolved && (
                                                                <button
                                                                    onClick={() => handleResolve(log.id)}
                                                                    className="text-xs px-2 py-1 bg-green-500/10 text-green-700 rounded hover:bg-green-500/20"
                                                                >
                                                                    Çöz
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Email Logs Table */}
                        {activeTab === 'emails' && (
                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Alıcı</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Konu</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Şablon</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {logs.length === 0 ? (
                                                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Log bulunamadı</td></tr>
                                            ) : (
                                                logs.map((log: EmailLog) => (
                                                    <tr key={log.id} className="hover:bg-gray-100/50">
                                                        <td className="px-4 py-3 text-sm text-gray-900">{log.to}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{log.subject}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-500">{log.template || '-'}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={clsx('px-2 py-1 text-xs rounded-full', statusColors[log.status])}>
                                                                {log.status.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Pagination */}
                        {meta && meta.totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4">
                                <p className="text-sm text-gray-500">
                                    Sayfa {page} / {meta.totalPages}
                                    ({meta.total} kayıt)
                                </p>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1 bg-white border border-gray-200 rounded text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
                                    >
                                        Önceki
                                    </button>
                                    <button
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={page >= meta.totalPages}
                                        className="px-3 py-1 bg-white border border-gray-200 rounded text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
                                    >
                                        Sonraki
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
    const colorClasses: Record<string, string> = {
        red: 'bg-red-500/10 border-red-500/20 text-red-600',
        yellow: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700',
        green: 'bg-green-500/10 border-green-500/20 text-green-700',
        blue: 'bg-blue-500/10 border-blue-500/20 text-blue-700',
        gray: 'bg-gray-100 border-gray-300 text-gray-500',
    };

    return (
        <div className={clsx('p-4 rounded-lg border', colorClasses[color])}>
            <p className="text-sm opacity-80">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
    );
}
