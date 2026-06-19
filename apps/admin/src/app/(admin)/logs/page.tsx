'use client';

import { useState, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/api';
import clsx from 'clsx';
import { Button, Select, enumLabel, severityConfig } from '@tarodan/ui';
import { AdminTabs } from '@/components/AdminTabs';
import { FilterToolbar } from '@/components/admin-list';
import { DataTable } from '@/components/DataTable';
import { Pagination } from '@/components/Pagination';
import { useAdminResource } from '@/hooks/useAdminResource';
import type { ColumnDef } from '@/components/DataTable';
import {
    ExclamationTriangleIcon,
    ShieldExclamationIcon,
    EnvelopeIcon,
    CheckCircleIcon,
    ClockIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// ─── Tipler ────────────────────────────────────────────────────────────────

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

// ─── Sabit veriler ──────────────────────────────────────────────────────────

const LOG_TABS = [
    { id: 'errors' as LogTab, name: 'Hata Logları', icon: ExclamationTriangleIcon },
    { id: 'security' as LogTab, name: 'Güvenlik Logları', icon: ShieldExclamationIcon },
    { id: 'emails' as LogTab, name: 'E-posta Logları', icon: EnvelopeIcon },
];

const severityColors: Record<string, string> = {
    critical: 'bg-danger-500/10 text-danger-600 border-danger-500/20',
    high: 'bg-danger-500/10 text-danger-600 border-danger-500/20',
    error: 'bg-danger-500/10 text-danger-600 border-danger-500/20',
    medium: 'bg-warning-500/10 text-warning-700 border-warning-500/20',
    warning: 'bg-warning-500/10 text-warning-700 border-warning-500/20',
    low: 'bg-info-500/10 text-info-700 border-info-500/20',
};

const statusColors: Record<string, string> = {
    sent: 'bg-success-500/10 text-success-700',
    delivered: 'bg-success-500/10 text-success-700',
    queued: 'bg-warning-500/10 text-warning-700',
    bounced: 'bg-danger-500/10 text-danger-600',
    failed: 'bg-danger-500/10 text-danger-600',
};

const eventTypeLabels: Record<string, string> = {
    failed_login: 'Başarısız Giriş',
    ip_block: 'IP Engelleme',
    suspicious_activity: 'Şüpheli Aktivite',
    password_reset: 'Şifre Sıfırlama',
    '2fa_enabled': '2FA Aktif',
    account_locked: 'Hesap Kilitlendi',
};

const SEARCH_PLACEHOLDERS: Record<LogTab, string> = {
    errors: 'Hata mesajı ara...',
    security: 'Olay/IP/e-posta ara...',
    emails: 'Alıcı/konu ara...',
};

// ─── Yardımcılar ────────────────────────────────────────────────────────────

function formatDate(date: string) {
    return new Date(date).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ─── Kolonlar ───────────────────────────────────────────────────────────────

function buildErrorColumns(): ColumnDef<ErrorLog, any>[] {
    return [
        {
            id: 'severity',
            header: 'Seviye',
            cell: ({ row }) => (
                <span
                    className={clsx('px-2 py-1 text-xs rounded-full border', severityColors[row.original.severity])}
                >
                    {enumLabel(severityConfig, row.original.severity)}
                </span>
            ),
        },
        {
            id: 'message',
            header: 'Mesaj',
            cell: ({ row }) => (
                <span className="text-sm text-heading max-w-md truncate block">{row.original.message}</span>
            ),
        },
        {
            id: 'source',
            header: 'Kaynak',
            cell: ({ row }) => <span className="text-sm text-muted">{row.original.source}</span>,
        },
        {
            id: 'createdAt',
            header: 'Tarih',
            cell: ({ row }) => (
                <span className="text-sm text-muted whitespace-nowrap">{formatDate(row.original.createdAt)}</span>
            ),
        },
    ];
}

function buildSecurityColumns(onResolve: (id: string) => void): ColumnDef<SecurityLog, any>[] {
    return [
        {
            id: 'eventType',
            header: 'Olay',
            cell: ({ row }) => (
                <span className="text-sm text-heading">
                    {eventTypeLabels[row.original.eventType] || row.original.eventType}
                </span>
            ),
        },
        {
            id: 'severity',
            header: 'Seviye',
            cell: ({ row }) => (
                <span
                    className={clsx(
                        'px-2 py-1 text-xs rounded-full border',
                        severityColors[row.original.severity],
                    )}
                >
                    {enumLabel(severityConfig, row.original.severity)}
                </span>
            ),
        },
        {
            id: 'ipEmail',
            header: 'IP / E-posta',
            cell: ({ row }) => (
                <span className="text-sm text-muted">
                    {row.original.ipAddress || row.original.email || '-'}
                </span>
            ),
        },
        {
            id: 'resolved',
            header: 'Durum',
            cell: ({ row }) =>
                row.original.resolved ? (
                    <span className="flex items-center text-success-700 text-sm">
                        <CheckCircleIcon className="h-4 w-4 mr-1" /> Çözüldü
                    </span>
                ) : (
                    <span className="flex items-center text-warning-700 text-sm">
                        <ClockIcon className="h-4 w-4 mr-1" /> Bekliyor
                    </span>
                ),
        },
        {
            id: 'createdAt',
            header: 'Tarih',
            cell: ({ row }) => (
                <span className="text-sm text-muted whitespace-nowrap">{formatDate(row.original.createdAt)}</span>
            ),
        },
        {
            id: 'actions',
            header: 'İşlem',
            cell: ({ row }) =>
                !row.original.resolved ? (
                    <Button
                        variant="secondary"
                        onClick={() => onResolve(row.original.id)}
                        className="text-xs px-2 py-1 bg-success-500/10 text-success-700 rounded hover:bg-success-500/20"
                    >
                        Çöz
                    </Button>
                ) : null,
        },
    ];
}

function buildEmailColumns(): ColumnDef<EmailLog, any>[] {
    return [
        {
            id: 'to',
            header: 'Alıcı',
            cell: ({ row }) => <span className="text-sm text-heading">{row.original.to}</span>,
        },
        {
            id: 'subject',
            header: 'Konu',
            cell: ({ row }) => (
                <span className="text-sm text-muted max-w-xs truncate block">{row.original.subject}</span>
            ),
        },
        {
            id: 'template',
            header: 'Şablon',
            cell: ({ row }) => <span className="text-sm text-muted">{row.original.template || '-'}</span>,
        },
        {
            id: 'status',
            header: 'Durum',
            cell: ({ row }) => (
                <span className={clsx('px-2 py-1 text-xs rounded-full', statusColors[row.original.status])}>
                    {row.original.status.toUpperCase()}
                </span>
            ),
        },
        {
            id: 'createdAt',
            header: 'Tarih',
            cell: ({ row }) => (
                <span className="text-sm text-muted whitespace-nowrap">{formatDate(row.original.createdAt)}</span>
            ),
        },
    ];
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
    const colorClasses: Record<string, string> = {
        red: 'bg-danger-500/10 border-danger-500/20 text-danger-600',
        yellow: 'bg-warning-500/10 border-warning-500/20 text-warning-700',
        green: 'bg-success-500/10 border-success-500/20 text-success-700',
        blue: 'bg-info-500/10 border-info-500/20 text-info-700',
        gray: 'bg-surface-alt border-border text-muted',
    };

    return (
        <div className={clsx('p-4 rounded-lg border', colorClasses[color])}>
            <p className="text-sm opacity-80">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
    );
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function LogsPage() {
    const [activeTab, setActiveTab] = useState<LogTab>('errors');

    // stats: useAdminResource hook'u stats dönmediğinden fetcher yan etkisiyle yakalanır
    const statsRef = useRef<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [metaTotal, setMetaTotal] = useState<number>(0);

    // Fetcher — activeTab'a göre doğru API çağrısı; stats'ı yan etki ile yakalar
    const fetcher = useCallback(
        (params: Record<string, any>) => {
            const call =
                activeTab === 'errors'
                    ? adminApi.getErrorLogs(params)
                    : activeTab === 'security'
                    ? adminApi.getSecurityLogs(params)
                    : adminApi.getEmailLogs(params);

            call.then((res) => {
                const d = res?.data;
                const newStats = d?.stats ?? null;
                const newTotal: number = d?.meta?.total ?? 0;
                if (JSON.stringify(newStats) !== JSON.stringify(statsRef.current)) {
                    statsRef.current = newStats;
                    setStats(newStats);
                }
                setMetaTotal(newTotal);
            });

            return call;
        },
        [activeTab],
    );

    // Tek useAdminResource; queryKey'e activeTab eklenerek sekme değişiminde yeni fetch tetiklenir.
    // Arama artık yazarken smooth (debounce, varsayılan 300 ms); Enter şart değil.
    const r = useAdminResource<ErrorLog | SecurityLog | EmailLog>({
        queryKey: `logs:${activeTab}`,
        fetcher,
        limit: 20,
        syncUrl: true,
        errorMessage: 'Loglar yüklenirken bir hata oluştu',
    });

    // Sekme değişimi — queryKey değişir → hook yeni veri çeker
    const handleTabChange = (key: string) => {
        setActiveTab(key as LogTab);
        setStats(null);
        statsRef.current = null;
    };

    // Security logu çözümleme
    const handleResolve = async (id: string) => {
        try {
            await adminApi.resolveSecurityIssue(id);
            toast.success('Sorun çözümlendi');
            r.refetch();
        } catch {
            toast.error('İşlem başarısız');
        }
    };

    // Kolonlar ve emptyText sekmeye göre dallanır
    const columns: ColumnDef<any, any>[] =
        activeTab === 'errors'
            ? (buildErrorColumns() as ColumnDef<any, any>[])
            : activeTab === 'security'
            ? (buildSecurityColumns(handleResolve) as ColumnDef<any, any>[])
            : (buildEmailColumns() as ColumnDef<any, any>[]);

    const emptyText =
        activeTab === 'errors'
            ? 'Hata logu bulunamadı'
            : activeTab === 'security'
            ? 'Güvenlik logu bulunamadı'
            : 'E-posta logu bulunamadı';

    // Sekmeye özgü filtre widget'ları
    const filterWidgets =
        activeTab === 'errors' ? (
            <Select
                value={r.filters.severity ?? 'all'}
                onChange={(e) => r.setFilter('severity', e.target.value)}
                className="sm:w-48"
                selectSize="sm"
            >
                <option value="all">Tüm Seviyeler</option>
                <option value="critical">Kritik</option>
                <option value="error">Hata</option>
                <option value="warning">Uyarı</option>
                <option value="low">Düşük</option>
            </Select>
        ) : activeTab === 'security' ? (
            <>
                <Select
                    value={r.filters.severity ?? 'all'}
                    onChange={(e) => r.setFilter('severity', e.target.value)}
                    className="sm:w-48"
                    selectSize="sm"
                >
                    <option value="all">Tüm Seviyeler</option>
                    <option value="critical">Kritik</option>
                    <option value="high">Yüksek</option>
                    <option value="medium">Orta</option>
                    <option value="low">Düşük</option>
                </Select>
                <Select
                    value={r.filters.resolved ?? 'all'}
                    onChange={(e) => r.setFilter('resolved', e.target.value)}
                    className="sm:w-44"
                    selectSize="sm"
                >
                    <option value="all">Tüm Durumlar</option>
                    <option value="false">Bekleyenler</option>
                    <option value="true">Çözülenler</option>
                </Select>
            </>
        ) : (
            <>
                <Select
                    value={r.filters.status ?? 'all'}
                    onChange={(e) => r.setFilter('status', e.target.value)}
                    className="sm:w-48"
                    selectSize="sm"
                >
                    <option value="all">Tüm Durumlar</option>
                    <option value="sent">Gönderildi</option>
                    <option value="delivered">Teslim Edildi</option>
                    <option value="queued">Kuyrukta</option>
                    <option value="bounced">Geri Döndü</option>
                    <option value="failed">Başarısız</option>
                </Select>
                <Select
                    value={r.filters.template ?? 'all'}
                    onChange={(e) => r.setFilter('template', e.target.value)}
                    className="sm:w-48"
                    selectSize="sm"
                >
                    <option value="all">Tüm Şablonlar</option>
                    <option value="welcome">Hoş Geldiniz</option>
                    <option value="password_reset">Şifre Sıfırlama</option>
                    <option value="order_confirmation">Sipariş Onayı</option>
                    <option value="shipping_update">Kargo Güncelleme</option>
                </Select>
            </>
        );

    return (
        <div className="space-y-6 p-6">
            {/* Başlık */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-heading">Sistem Logları</h1>
                    <p className="text-muted mt-1">Hata, güvenlik ve e-posta loglarını inceleyin</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => r.refetch()}
                        className="p-2 shrink-0 bg-surface-elevated border border-border rounded-lg text-muted hover:text-heading"
                    >
                        <ArrowPathIcon className={clsx('h-5 w-5 shrink-0', r.isLoading && 'animate-spin')} />
                    </Button>
                </div>
            </div>

            {/* Sekmeler — ikonlu */}
            <AdminTabs
                tabs={LOG_TABS.map((t) => ({ key: t.id, label: t.name, icon: t.icon }))}
                value={activeTab}
                onChange={handleTabChange}
            />

            {/* İstatistik kartları — API yanıtından gelen stats */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {activeTab === 'errors' && (
                        <>
                            <StatCard label="Kritik" value={stats.critical ?? 0} color="red" />
                            <StatCard label="Hata" value={stats.error ?? 0} color="yellow" />
                            <StatCard label="Uyarı" value={stats.warning ?? 0} color="blue" />
                            <StatCard label="Toplam" value={metaTotal} color="gray" />
                        </>
                    )}
                    {activeTab === 'security' && (
                        <>
                            <StatCard
                                label="Çözülmemiş Kritik"
                                value={stats.unresolvedHighSeverity ?? 0}
                                color="red"
                            />
                            <StatCard
                                label="Başarısız Giriş"
                                value={stats.byEventType?.failed_login ?? 0}
                                color="yellow"
                            />
                            <StatCard
                                label="IP Engelleme"
                                value={stats.byEventType?.ip_block ?? 0}
                                color="blue"
                            />
                            <StatCard label="Toplam" value={metaTotal} color="gray" />
                        </>
                    )}
                    {activeTab === 'emails' && (
                        <>
                            <StatCard
                                label="Teslim Oranı"
                                value={`${stats.deliveryRate ?? 0}%`}
                                color="green"
                            />
                            <StatCard
                                label="Bounce Oranı"
                                value={`${stats.bounceRate ?? 0}%`}
                                color="red"
                            />
                            <StatCard label="Gönderilen" value={stats.byStatus?.sent ?? 0} color="blue" />
                            <StatCard label="Toplam" value={metaTotal} color="gray" />
                        </>
                    )}
                </div>
            )}

            {/* Arama + Filtreler — smooth debounce ile (useAdminResource) */}
            <FilterToolbar
                search={r.search}
                onSearchChange={r.setSearch}
                onSearchSubmit={r.onSearchSubmit}
                searchPlaceholder={SEARCH_PLACEHOLDERS[activeTab]}
            >
                {filterWidgets}
            </FilterToolbar>

            {/* Tablo */}
            <DataTable<any>
                columns={columns}
                data={r.rows}
                loading={r.isLoading}
                emptyText={emptyText}
                getRowId={(row) => row.id}
            />

            {/* Sayfalama */}
            <Pagination page={r.page} totalPages={r.totalPages} onPageChange={r.setPage} />
        </div>
    );
}
