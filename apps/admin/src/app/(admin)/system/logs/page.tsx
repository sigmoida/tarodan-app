"use client";

import { useCallback, useState } from "react";
import { adminApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { usePrompt } from "@/provider/PromptProvider";
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
import { logFilterFields, AUDIT_HIDDEN_FILTERS } from "./_lib/filters";
import { ErrorDetail, AuditDetail } from "./_components/LogDetails";
import { useTranslations } from "next-intl";

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

function LogsTable({ tab }: { tab: LogTab }) {
  const t = useTranslations();
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const prompt = usePrompt();
  const { user } = useSession();
  const resolve = useAdminMutation(
    ({ id, notes }: { id: string; notes?: string }) =>
      adminApi.resolveSecurityIssue(id, notes),
    {
      invalidates: ["logs:security"],
      successMessage: t("admin.system.logs.resolveSuccess"),
    },
  );
  const blockIp = useAdminMutation(
    ({ ipAddress, reason }: { ipAddress: string; reason?: string }) =>
      adminApi.blockIP({ ipAddress, reason }),
    {
      invalidates: ["logs:security"],
      successMessage: t("admin.system.logs.blockIpSuccess"),
    },
  );

  // Çözme notu API'de hep vardı ama UI hiç göndermiyordu — gerekçe kayboluyordu.
  const onResolve = async (row: SecurityLog) => {
    const notes = await prompt({
      title: t("admin.system.logs.resolvePromptTitle"),
      label: t("admin.system.logs.resolvePromptLabel"),
      placeholder: t("admin.system.logs.resolvePromptPlaceholder"),
      required: false,
      confirmLabel: t("admin.system.logs.resolve"),
    });
    if (notes === null) return; // vazgeçti
    resolve.mutate({ id: row.id, notes: notes || undefined });
  };

  const onBlockIp = async (row: SecurityLog) => {
    if (!row.ipAddress) return;
    const reason = await prompt({
      title: t("admin.system.logs.blockIpPromptTitle", {
        ip: row.ipAddress,
      }),
      description: t("admin.system.logs.blockIpPromptDescription"),
      label: t("admin.system.logs.blockIpPromptLabel"),
      required: false,
      destructive: true,
      confirmLabel: t("admin.system.logs.blockIp"),
    });
    if (reason === null) return;
    blockIp.mutate({ ipAddress: row.ipAddress, reason: reason || undefined });
  };

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
          onResolve,
          t,
          resolve.isPending ? resolve.variables?.id : undefined,
          {
            // Uç @Roles(super_admin); buton da yalnız ona görünür.
            canBlockIp: user.role === "super_admin",
            onBlockIp,
          },
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
        sortType: params.sortType,
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
      filters={logFilterFields(t, tab)}
      initialFilters={tab === "audit" ? AUDIT_HIDDEN_FILTERS : undefined}
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
      <ResourceList.Toolbar searchPlaceholder={searchPlaceholders(t)[tab]} />
      <LogsTable tab={tab} />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
