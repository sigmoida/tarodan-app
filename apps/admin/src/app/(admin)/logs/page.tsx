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
    ClipboardDocumentIcon,
    CheckCircleIcon,
    ClockIcon,
    ArrowPathIcon,
    UserIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// ─── Tipler ────────────────────────────────────────────────────────────────

type LogTab = 'errors' | 'security' | 'emails' | 'audit';

interface ErrorLog {
    id: string;
    severity: string;
    message: string;
    stackTrace?: string;
    source: string;
    endpoint?: string;
    userId?: string;
    requestId?: string;
    metadata?: {
        status?: number;
        name?: string;
        causes?: string[];
        response?: any;
        ip?: string;
        userAgent?: string;
        body?: any;
    };
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

interface AuditLog {
    id: string;
    adminUserId: string;
    admin?: { id: string; email: string } | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string;
    createdAt: string;
}

// ─── Sabit veriler ──────────────────────────────────────────────────────────

const LOG_TABS: {
    id: LogTab;
    name: string;
    icon: React.ElementType;
    description: string;
}[] = [
    {
        id: 'errors',
        name: 'Hata Logları',
        icon: ExclamationTriangleIcon,
        description: 'API isteklerinde oluşan HTTP 4xx/5xx hataları, stack trace ve request detayları',
    },
    {
        id: 'security',
        name: 'Güvenlik Logları',
        icon: ShieldExclamationIcon,
        description: 'Başarısız girişler, IP engellemeleri ve şüpheli aktivite gibi güvenlik olayları',
    },
    {
        id: 'emails',
        name: 'E-posta Logları',
        icon: EnvelopeIcon,
        description: 'Sistem tarafından gönderilen tüm e-postaların gönderim durumu ve teslim bilgileri',
    },
    {
        id: 'audit',
        name: 'Denetim Logları',
        icon: ClipboardDocumentIcon,
        description: 'Admin kullanıcıların yaptığı işlemler — kim, ne zaman, hangi kaydı değiştirdi',
    },
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

const ACTION_LABELS: Record<string, string> = {
    user_ban: 'Kullanıcı Banlandı',
    user_unban: 'Ban Kaldırıldı',
    product_approve: 'Ürün Onaylandı',
    product_reject: 'Ürün Reddedildi',
    product_delete: 'Ürün Silindi',
    order_update: 'Sipariş Güncellendi',
    payment_refund: 'Ödeme İadesi',
    category_create: 'Kategori Oluşturuldu',
    category_update: 'Kategori Güncellendi',
    category_delete: 'Kategori Silindi',
    commission_rule_create: 'Komisyon Kuralı Oluşturuldu',
    commission_rule_update: 'Komisyon Kuralı Güncellendi',
    commission_rule_delete: 'Komisyon Kuralı Silindi',
    trade_resolve: 'Takas Çözümlendi',
    message_approve: 'Mesaj Onaylandı',
    message_reject: 'Mesaj Reddedildi',
};

const ENTITY_LABELS: Record<string, string> = {
    User: 'Kullanıcı',
    Product: 'Ürün',
    Order: 'Sipariş',
    Payment: 'Ödeme',
    Category: 'Kategori',
    CommissionRule: 'Komisyon Kuralı',
    Trade: 'Takas',
    Message: 'Mesaj',
    SupportTicket: 'Destek Talebi',
};

const SEARCH_PLACEHOLDERS: Record<LogTab, string> = {
    errors: 'Hata mesajı ara...',
    security: 'Olay / IP / e-posta ara...',
    emails: 'Alıcı / konu ara...',
    audit: 'İşlem / admin ara...',
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

/** Frontend savunması: gizli alanları maskele (backend zaten maskeliyor, bu sadece ek katman) */
const REDACT_KEYS = new Set([
    'password', 'passwordHash', 'passwordConfirm', 'newPassword', 'oldPassword', 'currentPassword',
    'token', 'accessToken', 'refreshToken', 'resetToken', 'verifyToken', 'confirmToken', 'idToken',
    'secret', 'apiKey', 'apiSecret', 'clientSecret', 'signingKey',
    'creditCard', 'cardNumber', 'cvv', 'cvc', 'pin', 'otp',
]);

function redactDisplay(obj: any, depth = 0): any {
    if (depth > 5 || obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((v) => redactDisplay(v, depth + 1));
    return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
            k,
            REDACT_KEYS.has(k) ? '[GİZLİ]' : redactDisplay(v, depth + 1),
        ]),
    );
}

function JsonBlock({ value }: { value: any }) {
    const safe = redactDisplay(value);
    return (
        <pre className="bg-surface border border-border rounded p-2 overflow-auto text-xs max-h-48 text-muted whitespace-pre-wrap">
            {JSON.stringify(safe, null, 2)}
        </pre>
    );
}

// ─── Genişleme panelleri ─────────────────────────────────────────────────────

function ErrorDetail({ log }: { log: ErrorLog }) {
    return (
        <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted">
                {log.endpoint && (
                    <>
                        <span className="font-medium text-heading">Endpoint</span>
                        <span className="font-mono">{log.endpoint}</span>
                    </>
                )}
                {log.metadata?.status && (
                    <>
                        <span className="font-medium text-heading">HTTP Status</span>
                        <span className="font-mono">{log.metadata.status}</span>
                    </>
                )}
                {log.metadata?.name && (
                    <>
                        <span className="font-medium text-heading">Hata Tipi</span>
                        <span className="font-mono">{log.metadata.name}</span>
                    </>
                )}
                {log.userId && (
                    <>
                        <span className="font-medium text-heading">Kullanıcı ID</span>
                        <span className="font-mono">{log.userId}</span>
                    </>
                )}
                {log.metadata?.ip && (
                    <>
                        <span className="font-medium text-heading">IP Adresi</span>
                        <span className="font-mono">{log.metadata.ip}</span>
                    </>
                )}
                {log.metadata?.userAgent && (
                    <>
                        <span className="font-medium text-heading">User-Agent</span>
                        <span className="font-mono break-all">{log.metadata.userAgent}</span>
                    </>
                )}
            </div>

            {log.metadata?.causes && log.metadata.causes.length > 0 && (
                <div>
                    <p className="font-medium text-heading mb-1">Hata Zinciri</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-danger-600 font-mono text-xs">
                        {log.metadata.causes.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ol>
                </div>
            )}

            {log.metadata?.response && (
                <div>
                    <p className="font-medium text-heading mb-1">Yanıt Detayı</p>
                    <JsonBlock value={log.metadata.response} />
                </div>
            )}

            {log.metadata?.body && (
                <div>
                    <p className="font-medium text-heading mb-1">Request Body <span className="text-xs font-normal text-muted">(hassas alanlar gizlenmiştir)</span></p>
                    <JsonBlock value={log.metadata.body} />
                </div>
            )}

            {log.stackTrace && (
                <div>
                    <p className="font-medium text-heading mb-1">Stack Trace</p>
                    <pre className="bg-surface border border-border rounded p-2 overflow-auto text-xs max-h-48 text-muted whitespace-pre-wrap">
                        {log.stackTrace}
                    </pre>
                </div>
            )}
        </div>
    );
}

function AuditDetail({ log }: { log: AuditLog }) {
    return (
        <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted">
                <span className="font-medium text-heading">Admin</span>
                <span>{log.admin?.email ?? log.adminUserId}</span>

                <span className="font-medium text-heading">İşlem</span>
                <span>{ACTION_LABELS[log.action] ?? log.action}</span>

                <span className="font-medium text-heading">Kayıt Tipi</span>
                <span>{ENTITY_LABELS[log.entityType] ?? log.entityType}</span>

                <span className="font-medium text-heading">Kayıt ID</span>
                <span className="font-mono">{log.entityId}</span>

                {log.ipAddress && (
                    <>
                        <span className="font-medium text-heading">IP Adresi</span>
                        <span className="font-mono">{log.ipAddress}</span>
                    </>
                )}
            </div>

            {log.oldValue && (
                <div>
                    <p className="font-medium text-heading mb-1">Eski Değerler <span className="text-xs font-normal text-muted">(hassas alanlar gizlenmiştir)</span></p>
                    <JsonBlock value={log.oldValue} />
                </div>
            )}

            {log.newValue && (
                <div>
                    <p className="font-medium text-heading mb-1">Yeni Değerler <span className="text-xs font-normal text-muted">(hassas alanlar gizlenmiştir)</span></p>
                    <JsonBlock value={log.newValue} />
                </div>
            )}
        </div>
    );
}

// ─── Chevron butonu (genişlet/kapat) ────────────────────────────────────────

function ExpandButton({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            className="text-muted hover:text-heading"
            title={isOpen ? 'Kapat' : 'Detay'}
        >
            <svg
                className={clsx('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
        </button>
    );
}

// ─── Kolon tanımları ─────────────────────────────────────────────────────────

function buildErrorColumns(
    expandedId: string | null,
    setExpandedId: (id: string | null) => void,
): ColumnDef<ErrorLog, any>[] {
    return [
        {
            id: 'expand',
            header: '',
            cell: ({ row }) => (
                <ExpandButton
                    isOpen={expandedId === row.original.id}
                    onToggle={() => setExpandedId(expandedId === row.original.id ? null : row.original.id)}
                />
            ),
        },
        {
            id: 'severity',
            header: 'Seviye',
            cell: ({ row }) => (
                <span className={clsx('px-2 py-1 text-xs rounded-full border', severityColors[row.original.severity])}>
                    {enumLabel(severityConfig, row.original.severity)}
                </span>
            ),
        },
        {
            id: 'message',
            header: 'Mesaj',
            cell: ({ row }) => (
                <div className="max-w-sm">
                    <span className="text-sm text-heading truncate block">{row.original.message}</span>
                    {row.original.endpoint && (
                        <span className="text-xs text-muted font-mono truncate block">{row.original.endpoint}</span>
                    )}
                </div>
            ),
        },
        {
            id: 'meta',
            header: 'Detay',
            cell: ({ row }) => {
                const m = row.original.metadata;
                return (
                    <div className="text-xs text-muted space-y-0.5">
                        {m?.status && <div>HTTP {m.status}</div>}
                        {m?.name && <div className="font-mono">{m.name}</div>}
                        {m?.ip && <div>{m.ip}</div>}
                    </div>
                );
            },
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
                    {eventTypeLabels[row.original.eventType] ?? row.original.eventType}
                </span>
            ),
        },
        {
            id: 'severity',
            header: 'Seviye',
            cell: ({ row }) => (
                <span className={clsx('px-2 py-1 text-xs rounded-full border', severityColors[row.original.severity])}>
                    {enumLabel(severityConfig, row.original.severity)}
                </span>
            ),
        },
        {
            id: 'ipEmail',
            header: 'IP / E-posta',
            cell: ({ row }) => (
                <span className="text-sm text-muted">
                    {row.original.ipAddress ?? row.original.email ?? '-'}
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
            cell: ({ row }) => <span className="text-sm text-muted">{row.original.template ?? '-'}</span>,
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

function buildAuditColumns(
    expandedId: string | null,
    setExpandedId: (id: string | null) => void,
): ColumnDef<AuditLog, any>[] {
    return [
        {
            id: 'expand',
            header: '',
            cell: ({ row }) => (
                <ExpandButton
                    isOpen={expandedId === row.original.id}
                    onToggle={() => setExpandedId(expandedId === row.original.id ? null : row.original.id)}
                />
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
            id: 'admin',
            header: 'Admin',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-muted shrink-0" />
                    <span className="text-sm truncate max-w-[160px]">
                        {row.original.admin?.email ?? row.original.adminUserId.substring(0, 8) + '…'}
                    </span>
                </div>
            ),
        },
        {
            id: 'action',
            header: 'İşlem',
            cell: ({ row }) => (
                <span className="badge badge-info text-xs">
                    {ACTION_LABELS[row.original.action] ?? row.original.action}
                </span>
            ),
        },
        {
            id: 'entityType',
            header: 'Kayıt Tipi',
            cell: ({ row }) => (
                <span className="text-sm text-muted">
                    {ENTITY_LABELS[row.original.entityType] ?? row.original.entityType}
                </span>
            ),
        },
        {
            id: 'entityId',
            header: 'ID',
            cell: ({ row }) => (
                <span className="font-mono text-xs text-muted">
                    {row.original.entityId.substring(0, 8)}…
                </span>
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
    const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
    const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

    const statsRef = useRef<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [metaTotal, setMetaTotal] = useState<number>(0);

    const fetcher = useCallback(
        (params: Record<string, any>) => {
            let call: Promise<any>;

            if (activeTab === 'errors') {
                call = adminApi.getErrorLogs(params);
            } else if (activeTab === 'security') {
                call = adminApi.getSecurityLogs(params);
            } else if (activeTab === 'emails') {
                call = adminApi.getEmailLogs(params);
            } else {
                // audit — map hook params to audit API shape
                call = adminApi.getAuditLogs({
                    page: params.page,
                    limit: params.limit,
                    ...(params.search ? { search: params.search } : {}),
                    action: params.action || undefined,
                    ...(params.entityType ? { entityType: params.entityType } : {}),
                    adminId: params.adminId || undefined,
                    fromDate: params.fromDate || undefined,
                    toDate: params.toDate || undefined,
                });
            }

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

    const r = useAdminResource<ErrorLog | SecurityLog | EmailLog | AuditLog>({
        queryKey: `logs:${activeTab}`,
        fetcher,
        limit: 20,
        syncUrl: true,
        errorMessage: 'Loglar yüklenirken bir hata oluştu',
        initialFilters:
            activeTab === 'audit'
                ? { action: '', entityType: '', adminId: '', fromDate: '', toDate: '' }
                : {},
    });

    const handleTabChange = (key: string) => {
        setActiveTab(key as LogTab);
        setStats(null);
        statsRef.current = null;
        setExpandedErrorId(null);
        setExpandedAuditId(null);
    };

    const handleResolve = async (id: string) => {
        try {
            await adminApi.resolveSecurityIssue(id);
            toast.success('Sorun çözümlendi');
            r.refetch();
        } catch {
            toast.error('İşlem başarısız');
        }
    };

    // ─── Kolon + expand seçimi ───────────────────────────────────────────────

    const columns: ColumnDef<any, any>[] =
        activeTab === 'errors'
            ? buildErrorColumns(expandedErrorId, setExpandedErrorId)
            : activeTab === 'security'
            ? buildSecurityColumns(handleResolve)
            : activeTab === 'emails'
            ? buildEmailColumns()
            : buildAuditColumns(expandedAuditId, setExpandedAuditId);

    const expandedId = activeTab === 'errors' ? expandedErrorId : activeTab === 'audit' ? expandedAuditId : null;

    const renderExpanded =
        activeTab === 'errors'
            ? (row: any) => (
                  <div className="px-4 pb-4">
                      <ErrorDetail log={row as ErrorLog} />
                  </div>
              )
            : activeTab === 'audit'
            ? (row: any) => (
                  <div className="px-4 pb-4">
                      <AuditDetail log={row as AuditLog} />
                  </div>
              )
            : undefined;

    const emptyText =
        activeTab === 'errors'
            ? 'Hata logu bulunamadı'
            : activeTab === 'security'
            ? 'Güvenlik logu bulunamadı'
            : activeTab === 'emails'
            ? 'E-posta logu bulunamadı'
            : 'Denetim logu bulunamadı';

    // ─── Filtre widget'ları ──────────────────────────────────────────────────

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
        ) : activeTab === 'emails' ? (
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
        ) : (
            /* audit filters */
            <>
                <Select
                    value={r.filters.action ?? ''}
                    onChange={(e) => r.setFilter('action', e.target.value)}
                    className="sm:w-52"
                    selectSize="sm"
                >
                    <option value="">Tüm İşlemler</option>
                    <option value="user_ban">Kullanıcı Banlandı</option>
                    <option value="user_unban">Ban Kaldırıldı</option>
                    <option value="product_approve">Ürün Onaylandı</option>
                    <option value="product_reject">Ürün Reddedildi</option>
                    <option value="product_delete">Ürün Silindi</option>
                    <option value="order_update">Sipariş Güncellendi</option>
                    <option value="payment_refund">Ödeme İadesi</option>
                </Select>
                <Select
                    value={r.filters.entityType ?? ''}
                    onChange={(e) => r.setFilter('entityType', e.target.value)}
                    className="sm:w-44"
                    selectSize="sm"
                >
                    <option value="">Tüm Kayıt Tipleri</option>
                    <option value="User">Kullanıcı</option>
                    <option value="Product">Ürün</option>
                    <option value="Order">Sipariş</option>
                    <option value="Payment">Ödeme</option>
                </Select>
            </>
        );

    // ─── Aktif sekmenin açıklaması ───────────────────────────────────────────

    const activeTabMeta = LOG_TABS.find((t) => t.id === activeTab)!;

    return (
        <div className="space-y-6 p-6">
            {/* Başlık */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-heading">Loglar</h1>
                    <p className="text-muted mt-1">Sistem hatalar, güvenlik olaylar, e-postalar ve admin işlemleri</p>
                </div>
                <Button
                    variant="secondary"
                    onClick={() => r.refetch()}
                    className="p-2 shrink-0 bg-surface-elevated border border-border rounded-lg text-muted hover:text-heading self-start sm:self-auto"
                >
                    <ArrowPathIcon className={clsx('h-5 w-5', r.isLoading && 'animate-spin')} />
                </Button>
            </div>

            {/* Sekmeler */}
            <AdminTabs
                tabs={LOG_TABS.map((t) => ({ key: t.id, label: t.name, icon: t.icon as any }))}
                value={activeTab}
                onChange={handleTabChange}
            />

            {/* Aktif sekme açıklaması */}
            <p className="text-sm text-muted -mt-2 flex items-center gap-2">
                <activeTabMeta.icon className="h-4 w-4 shrink-0" />
                {activeTabMeta.description}
            </p>

            {/* İstatistik kartları */}
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
                            <StatCard label="Çözülmemiş Kritik" value={stats.unresolvedHighSeverity ?? 0} color="red" />
                            <StatCard label="Başarısız Giriş" value={stats.byEventType?.failed_login ?? 0} color="yellow" />
                            <StatCard label="IP Engelleme" value={stats.byEventType?.ip_block ?? 0} color="blue" />
                            <StatCard label="Toplam" value={metaTotal} color="gray" />
                        </>
                    )}
                    {activeTab === 'emails' && (
                        <>
                            <StatCard label="Teslim Oranı" value={`${stats.deliveryRate ?? 0}%`} color="green" />
                            <StatCard label="Bounce Oranı" value={`${stats.bounceRate ?? 0}%`} color="red" />
                            <StatCard label="Gönderilen" value={stats.byStatus?.sent ?? 0} color="blue" />
                            <StatCard label="Toplam" value={metaTotal} color="gray" />
                        </>
                    )}
                </div>
            )}

            {/* Arama + Filtreler */}
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
                expandedId={expandedId}
                renderExpanded={renderExpanded}
            />

            {/* Sayfalama */}
            <Pagination page={r.page} totalPages={r.totalPages} onPageChange={r.setPage} />
        </div>
    );
}
