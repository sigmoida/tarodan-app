/** @format */

"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, type StatusConfig } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { ResourceList, useResourceList } from "@/components/list";
import { col, Empty } from "@/components/table";
import { type ColumnDef } from "@/components/DataTable";
import { type AdminTab } from "@/components/AdminTabs";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

// ─── Type ────────────────────────────────────────────────────────────────────

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

// ─── Label dictionaries ──────────────────────────────────────────────────────

const entityLabels = (t: T): Record<string, string> => ({
  product: t("admin.shared.moderation.entities.product"),
  user: t("admin.shared.moderation.entities.user"),
  collection: t("admin.shared.moderation.entities.collection"),
  upload: t("admin.shared.moderation.entities.upload"),
  message: t("admin.shared.moderation.entities.message"),
});

const fieldLabels = (t: T): Record<string, string> => ({
  avatar: t("admin.shared.moderation.fields.avatar"),
  bio: t("admin.shared.moderation.fields.bio"),
  display_name: t("admin.shared.moderation.fields.displayName"),
  cover: t("admin.shared.moderation.fields.cover"),
  item: t("admin.shared.moderation.fields.item"),
  product_image: t("admin.shared.moderation.fields.productImage"),
  message_image: t("admin.shared.moderation.fields.messageImage"),
  upload: t("admin.shared.moderation.fields.upload"),
  name: t("admin.shared.moderation.fields.name"),
  description: t("admin.shared.moderation.fields.description"),
  title: t("admin.shared.moderation.fields.title"),
  comment: t("admin.shared.moderation.fields.comment"),
});

const decisionOptions = (t: T) => [
  { value: "", label: t("admin.shared.moderation.decisions.all") },
  {
    value: "blocked",
    label: t("admin.shared.moderation.decisions.blockedFilter"),
  },
  { value: "flag", label: t("admin.shared.moderation.decisions.flag") },
  { value: "review", label: t("admin.shared.moderation.decisions.review") },
  { value: "pass", label: t("admin.shared.moderation.decisions.pass") },
];

/** AI moderation decision → badge. Anything outside the known values counts as "pass". */
const decisionConfig = (t: T): Record<string, StatusConfig> => ({
  blocked: {
    label: t("admin.shared.moderation.decisions.blocked"),
    variant: "danger",
  },
  flag: {
    label: t("admin.shared.moderation.decisions.flag"),
    variant: "danger",
  },
  review: {
    label: t("admin.shared.moderation.decisions.review"),
    variant: "warning",
  },
  pass: {
    label: t("admin.shared.moderation.decisions.pass"),
    variant: "success",
  },
});

const decisionKey = (d: string) =>
  d === "blocked" || d === "flag" || d === "review" ? d : "pass";

/** Admin detail route from entity type + id (null if none). */
function entityHref(e: ModerationEvent): string | null {
  if (!e.entityId) return null;
  if (e.entityType === "product") return `/catalog/products/${e.entityId}`;
  if (e.entityType === "user") return `/accounts/users/${e.entityId}`;
  return null;
}

function moderationColumns(
  withEntityCol: boolean,
  t: T,
): ColumnDef<ModerationEvent, unknown>[] {
  const cols: ColumnDef<ModerationEvent, unknown>[] = [];
  if (withEntityCol) {
    cols.push(
      col.custom<ModerationEvent>(
        t("admin.shared.moderation.entity"),
        (e) => {
          const label = entityLabels(t)[e.entityType] ?? e.entityType;
          const href = entityHref(e);
          return href ? (
            <Link href={href} className="text-primary-600 hover:underline">
              {label}
            </Link>
          ) : (
            <span className="text-body">{label}</span>
          );
        },
        { minWidth: 110, sortKey: "entityType", sortType: "text" },
      ),
    );
  }
  cols.push(
    col.text<ModerationEvent>(
      t("admin.shared.moderation.type"),
      (e) =>
        `${e.kind === "text" ? t("admin.shared.moderation.text") : t("admin.shared.moderation.image")}${
          e.field ? ` · ${fieldLabels(t)[e.field] ?? e.field}` : ""
        }`,
      { minWidth: 140, sortKey: "kind", sortType: "text" },
    ),
    col.badge<ModerationEvent>(
      t("admin.shared.moderation.result"),
      (e) => (
        <Badge status={decisionKey(e.decision)} config={decisionConfig(t)} />
      ),
      { sortKey: "decision", sortType: "text" },
    ),
    col.custom<ModerationEvent>(
      t("admin.shared.moderation.relevance"),
      (e) =>
        e.relevanceScore != null ? (
          <span className="whitespace-nowrap tabular-nums text-body">
            %{Math.round(e.relevanceScore * 100)}
          </span>
        ) : (
          <Empty />
        ),
      {
        align: "right",
        minWidth: 100,
        sortKey: "relevanceScore",
        sortType: "number",
      },
    ),
    col.custom<ModerationEvent>(
      t("admin.shared.moderation.nsfw"),
      (e) =>
        e.nsfwScore != null ? (
          <span className="whitespace-nowrap tabular-nums text-body">
            %{(e.nsfwScore * 100).toFixed(2)}
          </span>
        ) : (
          <Empty />
        ),
      {
        align: "right",
        minWidth: 110,
        sortKey: "nsfwScore",
        sortType: "number",
      },
    ),
    col.text<ModerationEvent>(
      t("admin.shared.moderation.reason"),
      (e) => e.reason,
      { grow: 2, sortKey: "reason" },
    ),
    col.user<ModerationEvent>(
      t("common.user"),
      (e) =>
        e.user
          ? {
              name: e.user.displayName || e.user.email,
              href: `/accounts/users/${e.user.id}`,
            }
          : null,
      { sortKey: "user.displayName", sortType: "text" },
    ),
    col.date<ModerationEvent>(t("common.date"), "createdAt"),
  );
  return cols;
}

function ModerationCount() {
  const t = useTranslations();
  const { total } = useResourceList<ModerationEvent>();
  return <>{t("admin.shared.moderation.count", { count: total })}</>;
}

function ExpandedRow({ e }: { e: ModerationEvent }) {
  const t = useTranslations();
  return (
    <div className="space-y-2 bg-surface-alt px-4 py-3 text-sm">
      {e.reason && (
        <div>
          <span className="font-medium text-heading">
            {t("admin.shared.moderation.reason")}:{" "}
          </span>
          <span className="text-muted">{e.reason}</span>
        </div>
      )}
      {e.relevanceScore != null && (
        <div>
          <span className="font-medium text-heading">
            {t("admin.shared.moderation.relevance")}:{" "}
          </span>
          <span className="text-muted">
            %{Math.round(e.relevanceScore * 100)}
          </span>
          <span className="ml-4 font-medium text-heading">
            {t("admin.shared.moderation.nsfw")}:{" "}
          </span>
          <span className="text-muted">
            %{((e.nsfwScore ?? 0) * 100).toFixed(2)}
          </span>
        </div>
      )}
      {e.labels && e.labels.length > 0 && (
        <div>
          <span className="font-medium text-heading">
            {t("admin.shared.moderation.labels")}:{" "}
          </span>
          <span className="text-muted">
            {e.labels
              .map((l) => `${l.label} (%${Math.round(l.score * 100)})`)
              .join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface ModerationEventsPanelProps {
  /** If set, only events of this type (e.g. "product", "user", "collection"). */
  entityType?: string;
  /** If set, events of a single entity. */
  entityId?: string;
  /** If set, events produced by a single user. */
  userId?: string;
  title?: string;
  description?: string;
  /** Show the entity type column. If unspecified: auto-on when there is no entityType. */
  showEntityColumn?: boolean;
  // Page tabs (optional) — passed so the tab bar stays visible while the AI tab is active.
  tabs?: AdminTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /**
   * Whether to render its own header/tab bar (default: true). If the page already
   * provides a persistent header + AdminTabs, pass `false` → content only
   * (Suspense covers only the content; header/tabs stay fixed on the page).
   */
  chrome?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * The SINGLE shared view of the AI moderation event log. Every "AI Audit" tab
 * (Products/Users/Collections) and the System page uses it; only entityType/
 * entityId change. SAME stack as the list pages: ResourceList + col.* +
 * ResourceList.Header — so the structure/table stays consistent across tabs.
 */
export function ModerationEventsPanel({
  entityType,
  entityId,
  userId,
  title,
  description,
  showEntityColumn,
  tabs,
  activeTab,
  onTabChange,
  chrome = true,
}: ModerationEventsPanelProps) {
  const t = useTranslations();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const withEntityCol = showEntityColumn ?? !entityType;
  const columns = moderationColumns(withEntityCol, t);

  return (
    <ResourceList<ModerationEvent>
      resource={`moderation-events:${entityType ?? "all"}:${entityId ?? ""}:${userId ?? ""}`}
      fetcher={(params) =>
        adminApi.get("/admin/moderation/events", {
          params: { ...params, entityType, entityId, userId },
        })
      }
      getRowId={(r) => r.id}
      syncUrl
      initialFilters={{ decision: "" }}
    >
      {chrome && (
        <ResourceList.Header
          title={title ?? t("admin.shared.moderation.title")}
          description={description ?? <ModerationCount />}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      )}
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect
          name="decision"
          options={decisionOptions(t)}
          className="sm:w-56"
        />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText={t("admin.shared.moderation.empty")}
        expandedId={expandedId}
        renderExpanded={(r) => <ExpandedRow e={r} />}
        onRowClick={(r) => setExpandedId(expandedId === r.id ? null : r.id)}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
