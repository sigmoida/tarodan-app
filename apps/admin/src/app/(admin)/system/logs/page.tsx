"use client";

import { useCallback, useState } from "react";
import { adminApi } from "@/lib/api";
import { ResourceList, useResourceList } from "@/components/list";
import { MetricCard } from "@/components/MetricCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  type LogTab,
  type AnyLog,
  type ErrorLog,
  type SecurityLog,
  type EmailLog,
  type AuditLog,
  logTabs,
  searchPlaceholders,
  emptyText,
} from "./_lib/types";
import {
  buildErrorColumns,
  buildSecurityColumns,
  buildEmailColumns,
  buildAuditColumns,
} from "./_lib/columns";
import { statCards } from "./_lib/stats";
import { LogsFilters } from "./_components/LogsFilters";
import { ErrorDetail, AuditDetail } from "./_components/LogDetails";
import { useTranslations } from "next-intl";

const FILTERS: Record<LogTab, Record<string, string>> = {
  errors: { severity: "all" },
  security: { severity: "all", resolved: "all" },
  emails: { status: "all", template: "all" },
  audit: {
    action: "",
    entityType: "",
    adminId: "",
    fromDate: "",
    toDate: "",
  },
};

function LogsStats({ tab }: { tab: LogTab }) {
  const t = useTranslations();
  const { data, total } = useResourceList();
  const cards = statCards(tab, data?.stats ?? null, total, t);
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.label}
          icon={card.icon}
          tone={card.tone}
          label={card.label}
          value={card.value}
        />
      ))}
    </div>
  );
}

function LogsToolbar({ tab }: { tab: LogTab }) {
  const t = useTranslations();
  const { filters, setFilter } = useResourceList();
  return (
    <ResourceList.Toolbar>
      <ResourceList.Search placeholder={searchPlaceholders(t)[tab]} />
      <LogsFilters tab={tab} filters={filters} setFilter={setFilter} />
    </ResourceList.Toolbar>
  );
}

function LogsTable({ tab }: { tab: LogTab }) {
  const t = useTranslations();
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const resolve = useAdminMutation(
    (id: string) => adminApi.resolveSecurityIssue(id),
    {
      invalidates: ["logs:security"],
      successMessage: t("admin.system.logs.resolveSuccess"),
    },
  );

  if (tab === "errors") {
    return (
      <ResourceList.Table<ErrorLog>
        columns={buildErrorColumns(
          {
            expandedId: expandedErrorId,
            setExpandedId: setExpandedErrorId,
          },
          t,
        )}
        emptyText={emptyText(t).errors}
        expandedId={expandedErrorId}
        renderExpanded={(row) => (
          <div className="px-4 pb-4">
            <ErrorDetail log={row} />
          </div>
        )}
      />
    );
  }
  if (tab === "security") {
    return (
      <ResourceList.Table<SecurityLog>
        columns={buildSecurityColumns(
          (id) => resolve.mutate(id),
          t,
          resolve.isPending ? resolve.variables : undefined,
        )}
        emptyText={emptyText(t).security}
      />
    );
  }
  if (tab === "emails") {
    return (
      <ResourceList.Table<EmailLog>
        columns={buildEmailColumns(t)}
        emptyText={emptyText(t).emails}
      />
    );
  }
  return (
    <ResourceList.Table<AuditLog>
      columns={buildAuditColumns(
        {
          expandedId: expandedAuditId,
          setExpandedId: setExpandedAuditId,
        },
        t,
      )}
      emptyText={emptyText(t).audit}
      expandedId={expandedAuditId}
      renderExpanded={(row) => (
        <div className="px-4 pb-4">
          <AuditDetail log={row} />
        </div>
      )}
    />
  );
}

export default function LogsPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<LogTab>("errors");
  const fetcher = useCallback(
    (params: Record<string, any>) => {
      if (tab === "errors") return adminApi.getErrorLogs(params);
      if (tab === "security") return adminApi.getSecurityLogs(params);
      if (tab === "emails") return adminApi.getEmailLogs(params);
      return adminApi.getAuditLogs({
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        action: params.action || undefined,
        entityType: params.entityType || undefined,
        adminId: params.adminId || undefined,
        fromDate: params.fromDate || undefined,
        toDate: params.toDate || undefined,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
    },
    [tab],
  );
  const tabs = logTabs(t);
  const tabMeta = tabs.find((item) => item.key === tab)!;

  return (
    <ResourceList<AnyLog>
      key={tab}
      resource={`logs:${tab}`}
      fetcher={fetcher}
      getRowId={(row) => row.id}
      limit={20}
      syncUrl
      initialFilters={FILTERS[tab]}
    >
      <ResourceList.Header
        title={t("admin.system.logs.title")}
        description={t("admin.system.logs.description")}
        tabs={tabs}
        activeTab={tab}
        onTabChange={(key) => setTab(key as LogTab)}
      />
      <p className="-mt-2 flex items-center gap-2 text-sm text-muted">
        <tabMeta.icon className="h-4 w-4 shrink-0" />
        {tabMeta.description}
      </p>
      <LogsStats tab={tab} />
      <LogsToolbar tab={tab} />
      <LogsTable tab={tab} />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
