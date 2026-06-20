"use client";

import Link from "next/link";
import { useMemo } from "react";
import { adminApi } from "@/lib/api";
import { Select } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";

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
  reason: string | null;
  createdAt: string;
}

// ─── Etiket sözlükleri ───────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  product: "Ürün",
  user: "Kullanıcı",
  collection: "Koleksiyon",
  upload: "Yükleme",
  message: "Mesaj",
};

const FIELD_LABELS: Record<string, string> = {
  avatar: "Avatar",
  bio: "Biyografi",
  display_name: "Görünen ad",
  cover: "Kapak görseli",
  item: "Koleksiyon öğesi",
  product_image: "Ürün görseli",
  message_image: "Mesaj görseli",
  upload: "Yükleme",
};

function decisionBadge(d: string) {
  const [cls, label] =
    d === "blocked"
      ? ["bg-danger-500/20 text-danger-600", "Engellendi"]
      : d === "flag"
        ? ["bg-danger-500/20 text-danger-600", "Uygunsuz"]
        : d === "review"
          ? ["bg-warning-500/20 text-warning-700", "İnceleme"]
          : ["bg-success-500/20 text-success-700", "Temiz"];
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${cls}`}>{label}</span>
  );
}

/** Varlık türü + id'den admin detay rotası (yoksa null). */
function entityHref(e: ModerationEvent): string | null {
  if (!e.entityId) return null;
  if (e.entityType === "product") return `/products/${e.entityId}`;
  if (e.entityType === "user") return `/users/${e.entityId}`;
  return null;
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
  tabs?: { key: string; label: string; badge?: number | string }[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * AI moderasyon olay günlüğünün TEK ortak görünümü. Her "AI Denetim" sekmesi
 * (Ürünler/Kullanıcılar/Koleksiyonlar) ve Sistem sayfası bunu kullanır; sadece
 * entityType/entityId değişir. Veri kaynağı: GET /admin/moderation/events.
 */
export function ModerationEventsPanel({
  entityType,
  entityId,
  userId,
  title = "AI Denetim",
  description,
  showEntityColumn,
  tabs,
  activeTab,
  onTabChange,
}: ModerationEventsPanelProps) {
  const { rows, total, page, setPage, totalPages, filters, setFilter, isLoading } =
    useAdminResource<ModerationEvent>({
      queryKey: `moderation-events:${entityType ?? "all"}:${entityId ?? ""}:${userId ?? ""}`,
      fetcher: (params) => {
        const { limit, ...rest } = params;
        return adminApi.get("/admin/moderation/events", {
          params: { ...rest, pageSize: limit, entityType, entityId, userId },
        });
      },
      limit: 20,
      initialFilters: { decision: "" },
      errorMessage: "AI denetim günlüğü yüklenemedi",
    });

  const withEntityCol = showEntityColumn ?? !entityType;

  const columns: ColumnDef<ModerationEvent, any>[] = useMemo(() => {
    const cols: ColumnDef<ModerationEvent, any>[] = [];
    if (withEntityCol) {
      cols.push({
        header: "Varlık",
        cell: ({ row }) => {
          const e = row.original;
          const label = ENTITY_LABELS[e.entityType] ?? e.entityType;
          const href = entityHref(e);
          return href ? (
            <Link href={href} className="text-heading hover:text-primary-400">
              {label}
            </Link>
          ) : (
            <span className="text-heading">{label}</span>
          );
        },
      });
    }
    cols.push(
      {
        header: "Tür",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.kind === "text" ? "Metin" : "Görsel"}
            {row.original.field
              ? ` · ${FIELD_LABELS[row.original.field] ?? row.original.field}`
              : ""}
          </span>
        ),
      },
      { header: "Sonuç", cell: ({ row }) => decisionBadge(row.original.decision) },
      {
        header: "İlgililik",
        cell: ({ row }) =>
          row.original.relevanceScore != null ? (
            <span className="text-sm whitespace-nowrap">
              %{Math.round(row.original.relevanceScore * 100)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        header: "Uygunsuzluk",
        cell: ({ row }) =>
          row.original.nsfwScore != null ? (
            <span className="text-sm whitespace-nowrap">
              %{(row.original.nsfwScore * 100).toFixed(2)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        header: "Sebep",
        cell: ({ row }) => (
          <span className="text-sm text-muted line-clamp-1">
            {row.original.reason || "—"}
          </span>
        ),
      },
      {
        header: "Kullanıcı",
        cell: ({ row }) => {
          const u = row.original.user;
          if (!u) return <span className="text-muted">—</span>;
          return (
            <Link
              href={`/users/${u.id}`}
              className="text-heading hover:text-primary-400"
            >
              {u.displayName || u.email}
            </Link>
          );
        },
      },
      {
        header: "Tarih",
        cell: ({ row }) => (
          <span className="text-xs text-muted whitespace-nowrap">
            {new Date(row.original.createdAt).toLocaleString("tr-TR")}
          </span>
        ),
      },
    );
    return cols;
  }, [withEntityCol]);

  return (
    <ResourceListPage<ModerationEvent>
      title={title}
      description={description ?? `${total} AI denetim kaydı`}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
      filters={
        <Select
          value={filters.decision ?? ""}
          onChange={(e) => setFilter("decision", e.target.value)}
          className="sm:w-56"
        >
          <option value="">Tüm sonuçlar</option>
          <option value="blocked">Engellenen</option>
          <option value="flag">Uygunsuz</option>
          <option value="review">İnceleme</option>
          <option value="pass">Temiz</option>
        </Select>
      }
      columns={columns}
      data={rows}
      loading={isLoading}
      emptyText="AI denetim kaydı yok"
      getRowId={(r) => r.id}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
