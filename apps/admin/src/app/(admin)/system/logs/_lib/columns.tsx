import { Button, cn, enumLabel, severityConfig } from '@tarodan/ui';
import { CheckCircleIcon, ClockIcon, UserIcon } from '@heroicons/react/24/outline';
import { col } from '@/components/table';
import { ExpandButton } from '../_components/ExpandButton';
import {
  type ErrorLog,
  type SecurityLog,
  type EmailLog,
  type AuditLog,
  severityColors,
  statusColors,
  eventTypeLabels,
  ACTION_LABELS,
  ENTITY_LABELS,
  formatDate,
} from './types';

const severityPill = (s: string) => (
  <span className={cn('rounded-full border px-2 py-1 text-xs', severityColors[s])}>
    {enumLabel(severityConfig, s)}
  </span>
);

type Toggle = { expandedId: string | null; setExpandedId: (id: string | null) => void };

const expandCol = <T extends { id: string }>({ expandedId, setExpandedId }: Toggle) =>
  col.custom<T>(
    '',
    (r) => (
      <ExpandButton
        isOpen={expandedId === r.id}
        onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
      />
    ),
    { grow: 0, minWidth: 44 },
  );

export function buildErrorColumns(toggle: Toggle) {
  return [
    expandCol<ErrorLog>(toggle),
    col.custom<ErrorLog>('Seviye', (r) => severityPill(r.severity), { minWidth: 90 }),
    col.custom<ErrorLog>(
      'Mesaj',
      (r) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-heading">{r.message}</span>
          {r.endpoint && (
            <span className="block truncate font-mono text-xs text-muted">{r.endpoint}</span>
          )}
        </div>
      ),
      { grow: 3, minWidth: 220 },
    ),
    col.custom<ErrorLog>('Detay', (r) => (
      <div className="space-y-0.5 text-xs text-muted">
        {r.metadata?.status && <div>HTTP {r.metadata.status}</div>}
        {r.metadata?.name && <div className="font-mono">{r.metadata.name}</div>}
        {r.metadata?.ip && <div>{r.metadata.ip}</div>}
      </div>
    )),
    col.muted<ErrorLog>('Kaynak', (r) => r.source),
    col.date<ErrorLog>('Tarih', (r) => r.createdAt),
  ];
}

export function buildSecurityColumns(onResolve: (id: string) => void) {
  return [
    col.custom<SecurityLog>('Olay', (r) => (
      <span className="text-sm text-heading">{eventTypeLabels[r.eventType] ?? r.eventType}</span>
    )),
    col.custom<SecurityLog>('Seviye', (r) => severityPill(r.severity), { minWidth: 90 }),
    col.muted<SecurityLog>('IP / E-posta', (r) => r.ipAddress ?? r.email ?? '-'),
    col.custom<SecurityLog>('Durum', (r) =>
      r.resolved ? (
        <span className="flex items-center gap-1 text-sm text-success-700">
          <CheckCircleIcon className="h-4 w-4" /> Çözüldü
        </span>
      ) : (
        <span className="flex items-center gap-1 text-sm text-warning-700">
          <ClockIcon className="h-4 w-4" /> Bekliyor
        </span>
      ),
    ),
    col.date<SecurityLog>('Tarih', (r) => r.createdAt),
    col.actions<SecurityLog>(
      (r) =>
        !r.resolved ? (
          <Button variant="secondary" size="sm" onClick={() => onResolve(r.id)}>
            Çöz
          </Button>
        ) : null,
      { header: 'İşlem' },
    ),
  ];
}

export function buildEmailColumns() {
  return [
    col.text<EmailLog>('Alıcı', (r) => r.to),
    col.muted<EmailLog>('Konu', (r) => r.subject),
    col.muted<EmailLog>('Şablon', (r) => r.template ?? '-'),
    col.custom<EmailLog>(
      'Durum',
      (r) => (
        <span className={cn('rounded-full px-2 py-1 text-xs', statusColors[r.status])}>
          {r.status.toUpperCase()}
        </span>
      ),
      { minWidth: 100 },
    ),
    col.date<EmailLog>('Tarih', (r) => r.createdAt),
  ];
}

export function buildAuditColumns(toggle: Toggle) {
  return [
    expandCol<AuditLog>(toggle),
    col.custom<AuditLog>('Tarih', (r) => (
      <span className="whitespace-nowrap text-sm text-muted">{formatDate(r.createdAt)}</span>
    )),
    col.custom<AuditLog>('Admin', (r) => (
      <div className="flex items-center gap-2">
        <UserIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="truncate text-sm">
          {r.admin?.email ?? (r.adminUserId?.substring(0, 8) ?? 'Sistem') + '…'}
        </span>
      </div>
    )),
    col.custom<AuditLog>('İşlem', (r) => (
      <span className="rounded-full bg-info-100 px-2 py-0.5 text-xs text-info-800">
        {ACTION_LABELS[r.action] ?? r.action}
      </span>
    )),
    col.muted<AuditLog>('Kayıt Tipi', (r) => ENTITY_LABELS[r.entityType] ?? r.entityType),
    col.code<AuditLog>('ID', (r) => `${r.entityId?.substring(0, 8) ?? '—'}…`),
  ];
}
