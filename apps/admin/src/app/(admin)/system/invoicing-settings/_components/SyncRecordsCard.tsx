"use client";

import { useMemo } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import { Badge } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import type { NetsisSyncRecordRow } from "@/lib/api/invoicing-settings.types";
import { fmtTry } from "@/lib/format";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { col } from "@/components/table";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useAdminResource } from "@/hooks/useAdminResource";
import {
  SYNC_STATUS_VARIANT,
  canRetrySync,
  truncateSyncError,
} from "../_lib/invoicing-settings";

export const NETSIS_SYNC_RESOURCE = "netsis-sync";
const RECENT_LIMIT = 20;

/**
 * Senkron kayıtları: Netsis'e aktarılan son 20 kaydın salt okunur özeti.
 * Başarısız kayıt satır menüsünden yeniden kuyruğa alınır (bütçe sıfırlanır;
 * gönderimi sunucudaki cron yapar).
 */
export function SyncRecordsCard() {
  const t = useTranslations();
  const { rows, isLoading } = useAdminResource<NetsisSyncRecordRow>({
    queryKey: NETSIS_SYNC_RESOURCE,
    limit: RECENT_LIMIT,
    fetcher: (params) => adminApi.getNetsisSyncRecords(params),
  });

  const retry = useAdminMutation(
    (id: string) => adminApi.retryNetsisSync(id),
    {
      invalidates: [NETSIS_SYNC_RESOURCE],
      successMessage: t("admin.invoicingSettings.sync.retried"),
    },
  );

  const columns = useMemo(
    () => [
      col.text(
        t("admin.invoicingSettings.sync.columns.kind"),
        (r: NetsisSyncRecordRow) =>
          t(`admin.invoicingSettings.sync.kind.${r.kind}` as MessageKey),
        { id: "kind", sortable: false },
      ),
      col.badge(
        t("admin.invoicingSettings.sync.columns.status"),
        (r: NetsisSyncRecordRow) => (
          <Badge variant={SYNC_STATUS_VARIANT[r.status]}>
            {t(`admin.invoicingSettings.sync.status.${r.status}` as MessageKey)}
          </Badge>
        ),
        { id: "status" },
      ),
      col.text(
        t("admin.invoicingSettings.sync.columns.amount"),
        (r: NetsisSyncRecordRow) => fmtTry(r.amount),
        { id: "amount", sortable: false },
      ),
      col.date(
        t("admin.invoicingSettings.sync.columns.createdAt"),
        (r: NetsisSyncRecordRow) => r.createdAt,
        { id: "createdAt", withTime: true },
      ),
      col.muted(
        t("admin.invoicingSettings.sync.columns.error"),
        (r: NetsisSyncRecordRow) => truncateSyncError(r.lastError),
        { id: "error", sortable: false, grow: 4 },
      ),
      col.rowMenu<NetsisSyncRecordRow>((r) => [
        canRetrySync(r) && {
          label: t("admin.invoicingSettings.sync.retry"),
          icon: ArrowPathIcon,
          onClick: () => retry.mutate(r.id),
          disabled: retry.isPending,
          isLoading: retry.isPending && retry.variables === r.id,
        },
      ]),
    ],
    [t, retry],
  );

  return (
    <SectionCard title={t("admin.invoicingSettings.sync.title")}>
      <p className="mb-3 text-sm text-muted">
        {t("admin.invoicingSettings.sync.description")}
      </p>
      <DataTable
        dense
        columns={columns}
        data={rows}
        loading={isLoading}
        getRowId={(r) => r.id}
        emptyText={t("admin.invoicingSettings.sync.empty")}
      />
    </SectionCard>
  );
}
