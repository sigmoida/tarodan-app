import { Badge, cn, severityConfig } from "@tarodan/ui";
import {
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { col } from "@/components/table";
import { ExpandButton } from "../_components/ExpandButton";
import { securityRowMenu } from "./rowActions";
import {
  type ErrorLog,
  type SecurityLog,
  type EmailLog,
  type AuditLog,
  statusColors,
  eventTypeLabels,
  actionLabels,
  entityLabels,
  formatDate,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

const severityPill = (s: string) => (
  <Badge status={s} config={severityConfig} />
);

type Toggle = {
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
};

const expandCol = <T extends { id: string }>(
  { expandedId, setExpandedId }: Toggle,
  t: ReturnType<typeof useTranslations<never>>,
) =>
  col.custom<T>(
    "",
    (r) => (
      <ExpandButton
        isOpen={expandedId === r.id}
        onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
        openTitle={t("common.details")}
        closeTitle={t("common.close")}
      />
    ),
    { grow: 0, minWidth: 44 },
  );

export function buildErrorColumns(toggle: Toggle, t: T) {
  return [
    expandCol<ErrorLog>(toggle, t),
    col.custom<ErrorLog>(
      t("admin.system.logs.level"),
      (r) => severityPill(r.severity),
      {
        minWidth: 90,
        sortKey: "severity",
        sortType: "text",
      },
    ),
    col.custom<ErrorLog>(
      t("common.message"),
      (r) => (
        <div className="min-w-0">
          <span className="block truncate text-sm text-heading">
            {r.message}
          </span>
          {r.endpoint && (
            <span className="block truncate font-mono text-xs text-muted">
              {r.endpoint}
            </span>
          )}
        </div>
      ),
      { grow: 3, minWidth: 220, sortKey: "message", sortType: "text" },
    ),
    col.custom<ErrorLog>(
      t("common.details"),
      (r) => (
        <div className="space-y-0.5 text-xs text-muted">
          {r.metadata?.status && <div>HTTP {r.metadata.status}</div>}
          {r.metadata?.name && (
            <div className="font-mono">{r.metadata.name}</div>
          )}
          {r.metadata?.ip && <div>{r.metadata.ip}</div>}
        </div>
      ),
      // The API sorts this computed JSON value before pagination.
      { sortKey: "metadata.status", sortType: "number" },
    ),
    col.muted<ErrorLog>(t("admin.system.logs.source"), "source"),
    col.date<ErrorLog>(t("common.date"), "createdAt"),
  ];
}

export function buildSecurityColumns(
  onResolve: (row: SecurityLog) => void,
  t: T,
  resolvingId?: string,
  opts?: {
    canBlockIp?: boolean;
    onBlockIp?: (row: SecurityLog) => void;
  },
) {
  return [
    col.custom<SecurityLog>(
      t("admin.system.logs.event"),
      (r) => (
        <span className="text-sm text-heading">
          {eventTypeLabels(t)[r.eventType] ?? r.eventType}
        </span>
      ),
      { sortKey: "eventType", sortType: "text" },
    ),
    col.custom<SecurityLog>(
      t("admin.system.logs.level"),
      (r) => severityPill(r.severity),
      {
        minWidth: 90,
        sortKey: "severity",
        sortType: "text",
      },
    ),
    col.muted<SecurityLog>(
      t("admin.system.logs.ipOrEmail"),
      (r) => r.ipAddress ?? r.email ?? "-",
      {
        sortKey: "ipAddress",
        sortType: "text",
      },
    ),
    col.custom<SecurityLog>(
      t("common.status"),
      (r) =>
        r.resolved ? (
          <span className="flex items-center gap-1 text-sm text-success-700">
            <CheckCircleIcon className="h-4 w-4" />{" "}
            {t("admin.system.logs.resolved")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-warning-700">
            <ClockIcon className="h-4 w-4" /> {t("common.pending")}
          </span>
        ),
      { sortKey: "resolved", sortType: "number" },
    ),
    col.date<SecurityLog>(t("common.date"), "createdAt"),
    col.rowMenu<SecurityLog>(securityRowMenu(onResolve, t, resolvingId, opts)),
  ];
}

export function buildEmailColumns(t: T) {
  const emailStatuses: Record<string, string> = {
    sent: t("admin.system.logs.emailStatuses.sent"),
    delivered: t("admin.system.logs.emailStatuses.delivered"),
    queued: t("admin.system.logs.emailStatuses.queued"),
    bounced: t("admin.system.logs.emailStatuses.bounced"),
    failed: t("admin.system.logs.emailStatuses.failed"),
  };
  return [
    col.text<EmailLog>(t("admin.system.logs.recipient"), "to"),
    col.muted<EmailLog>(t("admin.system.logs.subject"), "subject"),
    col.muted<EmailLog>(
      t("admin.system.logs.template"),
      (r) => r.template ?? "-",
      {
        sortKey: "template",
        sortType: "text",
      },
    ),
    col.custom<EmailLog>(
      t("common.status"),
      (r) => (
        <span
          className={cn(
            "rounded-full px-2 py-1 text-xs",
            statusColors[r.status],
          )}
        >
          {emailStatuses[r.status] ?? r.status}
        </span>
      ),
      { minWidth: 100, sortKey: "status", sortType: "text" },
    ),
    col.date<EmailLog>(t("common.date"), "createdAt"),
  ];
}

export function buildAuditColumns(toggle: Toggle, t: T) {
  return [
    expandCol<AuditLog>(toggle, t),
    col.custom<AuditLog>(
      t("common.date"),
      (r) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {formatDate(r.createdAt, t("common.dateLocale"))}
        </span>
      ),
      { sortKey: "createdAt", sortType: "date" },
    ),
    col.custom<AuditLog>(
      t("admin.system.logs.admin"),
      (r) => (
        <div className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 shrink-0 text-muted" />
          <span className="truncate text-sm">
            {r.admin?.email ??
              (r.adminUserId?.substring(0, 8) ??
                t("admin.system.logs.system")) + "…"}
          </span>
        </div>
      ),
      { sortKey: "admin.email", sortType: "text" },
    ),
    col.custom<AuditLog>(
      t("admin.system.logs.action"),
      (r) => (
        <span className="rounded-full bg-info-100 px-2 py-0.5 text-xs text-info-800">
          {actionLabels(t)[r.action] ?? r.action}
        </span>
      ),
      { sortKey: "action", sortType: "text" },
    ),
    col.muted<AuditLog>(
      t("admin.system.logs.entityType"),
      (r) => entityLabels(t)[r.entityType] ?? r.entityType,
      {
        sortKey: "entityType",
        sortType: "text",
      },
    ),
    col.code<AuditLog>("ID", (r) => `${r.entityId?.substring(0, 8) ?? "—"}…`, {
      sortKey: "entityId",
      sortType: "text",
    }),
  ];
}
