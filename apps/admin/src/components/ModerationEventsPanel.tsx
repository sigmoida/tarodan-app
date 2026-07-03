'use client';

import Link from 'next/link';
import { useState } from 'react';
import { adminApi } from '@/lib/api';
import { ResourceList, useResourceList } from '@/components/list';
import { col, Empty } from '@/components/table';
import { type ColumnDef } from '@/components/DataTable';
import { type AdminTab } from '@/components/AdminTabs';

// ─── Tip ─────────────────────────────────────────────────────────────────────

export interface ModerationEvent {
  id: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  user?: { id: string; displayName: string; email: string } | null;
  kind: string; // image | text
  field: string | null;
  decision: string; // pass | review | flag | blocked
  relevanceScore: number | null;
  nsfwScore: number | null;
  labels?: Array<{ label: string; score: number }> | null;
  reason: string | null;
  createdAt: string;
}

// ─── Etiket sözlükleri ───────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  product: 'Ürün',
  user: 'Kullanıcı',
  collection: 'Koleksiyon',
  upload: 'Yükleme',
  message: 'Mesaj',
};

const FIELD_LABELS: Record<string, string> = {
  avatar: 'Avatar',
  bio: 'Biyografi',
  display_name: 'Görünen ad',
  cover: 'Kapak görseli',
  item: 'Koleksiyon öğesi',
  product_image: 'Ürün görseli',
  message_image: 'Mesaj görseli',
  upload: 'Yükleme',
  name: 'Ad',
  description: 'Açıklama',
  title: 'Başlık',
  comment: 'Yorum',
};

const DECISION_OPTIONS = [
  { value: '', label: 'Tüm sonuçlar' },
  { value: 'blocked', label: 'Engellenen' },
  { value: 'flag', label: 'Uygunsuz' },
  { value: 'review', label: 'İnceleme' },
  { value: 'pass', label: 'Temiz' },
];

function DecisionBadge({ decision }: { decision: string }) {
  const [cls, label] =
    decision === 'blocked'
      ? ['bg-danger-500/20 text-danger-600', 'Engellendi']
      : decision === 'flag'
        ? ['bg-danger-500/20 text-danger-600', 'Uygunsuz']
        : decision === 'review'
          ? ['bg-warning-500/20 text-warning-700', 'İnceleme']
          : ['bg-success-500/20 text-success-700', 'Temiz'];
  return (
    <span className={`whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${cls}`}>{label}</span>
  );
}

/** Varlık türü + id'den admin detay rotası (yoksa null). */
function entityHref(e: ModerationEvent): string | null {
  if (!e.entityId) return null;
  if (e.entityType === 'product') return `/catalog/products/${e.entityId}`;
  if (e.entityType === 'user') return `/accounts/users/${e.entityId}`;
  return null;
}

function moderationColumns(withEntityCol: boolean): ColumnDef<ModerationEvent, unknown>[] {
  const cols: ColumnDef<ModerationEvent, unknown>[] = [];
  if (withEntityCol) {
    cols.push(
      col.custom<ModerationEvent>(
        'Varlık',
        (e) => {
          const label = ENTITY_LABELS[e.entityType] ?? e.entityType;
          const href = entityHref(e);
          return href ? (
            <Link href={href} className="text-primary-600 hover:underline">
              {label}
            </Link>
          ) : (
            <span className="text-body">{label}</span>
          );
        },
        { minWidth: 110 },
      ),
    );
  }
  cols.push(
    col.text<ModerationEvent>(
      'Tür',
      (e) =>
        `${e.kind === 'text' ? 'Metin' : 'Görsel'}${
          e.field ? ` · ${FIELD_LABELS[e.field] ?? e.field}` : ''
        }`,
      { minWidth: 140 },
    ),
    col.badge<ModerationEvent>('Sonuç', (e) => <DecisionBadge decision={e.decision} />),
    col.custom<ModerationEvent>(
      'İlgililik',
      (e) =>
        e.relevanceScore != null ? (
          <span className="whitespace-nowrap tabular-nums text-body">
            %{Math.round(e.relevanceScore * 100)}
          </span>
        ) : (
          <Empty />
        ),
      { align: 'right', minWidth: 100 },
    ),
    col.custom<ModerationEvent>(
      'Uygunsuzluk',
      (e) =>
        e.nsfwScore != null ? (
          <span className="whitespace-nowrap tabular-nums text-body">
            %{(e.nsfwScore * 100).toFixed(2)}
          </span>
        ) : (
          <Empty />
        ),
      { align: 'right', minWidth: 110 },
    ),
    col.text<ModerationEvent>('Sebep', (e) => e.reason, { grow: 2 }),
    col.user<ModerationEvent>('Kullanıcı', (e) =>
      e.user ? { name: e.user.displayName || e.user.email, href: `/accounts/users/${e.user.id}` } : null,
    ),
    col.date<ModerationEvent>('Tarih', (e) => e.createdAt),
  );
  return cols;
}

function ModerationCount() {
  const { total } = useResourceList<ModerationEvent>();
  return <>{`${total} AI denetim kaydı`}</>;
}

function ExpandedRow({ e }: { e: ModerationEvent }) {
  return (
    <div className="space-y-2 bg-surface-alt px-4 py-3 text-sm">
      {e.reason && (
        <div>
          <span className="font-medium text-heading">Sebep: </span>
          <span className="text-muted">{e.reason}</span>
        </div>
      )}
      {e.relevanceScore != null && (
        <div>
          <span className="font-medium text-heading">İlgililik: </span>
          <span className="text-muted">%{Math.round(e.relevanceScore * 100)}</span>
          <span className="ml-4 font-medium text-heading">Uygunsuzluk: </span>
          <span className="text-muted">%{((e.nsfwScore ?? 0) * 100).toFixed(2)}</span>
        </div>
      )}
      {e.labels && e.labels.length > 0 && (
        <div>
          <span className="font-medium text-heading">Etiketler: </span>
          <span className="text-muted">
            {e.labels.map((l) => `${l.label} (%${Math.round(l.score * 100)})`).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ModerationEventsPanelProps {
  /** Verilirse yalnızca bu türdeki olaylar (ör. "product", "user", "collection"). */
  entityType?: string;
  /** Verilirse tek bir varlığın olayları. */
  entityId?: string;
  /** Verilirse tek bir kullanıcının ürettiği olaylar. */
  userId?: string;
  title?: string;
  description?: string;
  /** Varlık türü sütununu göster. Belirtilmezse: entityType yoksa otomatik açık. */
  showEntityColumn?: boolean;
  // Sayfa sekmeleri (opsiyonel) — AI tab aktifken de sekme çubuğu görünsün diye iletilir.
  tabs?: AdminTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /**
   * Kendi başlık/sekme çubuğunu render etsin mi (varsayılan: true). Sayfa zaten
   * kalıcı bir başlık + AdminTabs sağlıyorsa `false` verilir → yalnız içerik
   * (Suspense'i sadece içerik kaplar; başlık/sekme sayfada sabit kalır).
   */
  chrome?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * AI moderasyon olay günlüğünün TEK ortak görünümü. Her "AI Denetim" sekmesi
 * (Ürünler/Kullanıcılar/Koleksiyonlar) ve Sistem sayfası bunu kullanır; sadece
 * entityType/entityId değişir. Liste sayfalarıyla AYNI stack: ResourceList +
 * col.* + ResourceList.Header — böylece sekme değişince yapı/tablo tutarlı kalır.
 */
export function ModerationEventsPanel({
  entityType,
  entityId,
  userId,
  title = 'AI Denetim',
  description,
  showEntityColumn,
  tabs,
  activeTab,
  onTabChange,
  chrome = true,
}: ModerationEventsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const withEntityCol = showEntityColumn ?? !entityType;
  const columns = moderationColumns(withEntityCol);

  return (
    <ResourceList<ModerationEvent>
      resource={`moderation-events:${entityType ?? 'all'}:${entityId ?? ''}:${userId ?? ''}`}
      fetcher={(params) => {
        const { limit, ...rest } = params;
        return adminApi.get('/admin/moderation/events', {
          params: { ...rest, pageSize: limit, entityType, entityId, userId },
        });
      }}
      getRowId={(r) => r.id}
      syncUrl
      initialFilters={{ decision: '' }}
      errorMessage="AI denetim günlüğü yüklenemedi"
    >
      {chrome && (
        <ResourceList.Header
          title={title}
          description={description ?? <ModerationCount />}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      )}
      <ResourceList.Toolbar>
        <ResourceList.Search placeholder="Kullanıcı veya sebep ara..." />
        <ResourceList.FilterSelect name="decision" options={DECISION_OPTIONS} className="sm:w-56" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText="AI denetim kaydı yok"
        expandedId={expandedId}
        renderExpanded={(r) => <ExpandedRow e={r} />}
        onRowClick={(r) => setExpandedId(expandedId === r.id ? null : r.id)}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
