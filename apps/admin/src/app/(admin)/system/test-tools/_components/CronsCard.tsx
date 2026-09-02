"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Spinner } from "@tarodan/ui";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { useConfirm } from "@/provider/ConfirmProvider";
import { type CronDef } from "../_lib/types";
import { useTranslations } from "next-intl";

/** Durum izleme penceresi: bu süre içinde terminal olmayan iş "hâlâ çalışıyor" sayılır. */
const STATUS_WATCH_MS = 15_000;
const STATUS_POLL_INTERVAL_MS = 2_000;

interface CronStatus {
  state: string;
  summary: string | null;
  failedReason: string | null;
}

interface WatchedJob {
  key: string;
  label: string;
  jobId: string;
  deadline: number;
}

/**
 * Zamanlanmış işleri elle tetikler (yalnız CRON_CATALOG.triggerable olanlar).
 *
 * İki koruma: (1) tetikleme onay penceresinden geçer — prod'da gerçek veri
 * uyarısıyla (TimeAdjustCard ile aynı desen); (2) "kuyruğa alındı" son söz
 * değildir — fişin akıbeti cron-status ucundan useQuery refetchInterval'ıyla
 * izlenir (useProductBulkImport'taki iş-izleme deseni) ve sonuç kartta KALICI
 * bir satır olarak görünür; geçici toast değil. Worker kapalıysa iş kuyrukta
 * bekler, satır "hâlâ çalışıyor" der — admin başarılı sanmaz. `not_found`
 * ayrı anlatılır: fiş removeOnComplete ile geçmişten temizlenmiştir; bunu
 * "çalışıyor" diye göstermek admin'i işi İKİNCİ kez tetiklemeye itiyordu.
 */
export function CronsCard({ isProd }: { isProd: boolean }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [watched, setWatched] = useState<WatchedJob | null>(null);

  const cronsQuery = useQuery<CronDef[]>({
    queryKey: adminKeys.all("test-tools-crons"),
    queryFn: async () => (await adminApi.get("/admin/test-tools/crons")).data,
  });
  const crons = cronsQuery.data ?? [];

  const statusQuery = useQuery<CronStatus>({
    queryKey: adminKeys.detail("test-tools-cron-status", watched?.jobId ?? "-"),
    queryFn: async () =>
      (
        await adminApi.get("/admin/test-tools/cron-status", {
          params: { jobId: watched?.jobId },
        })
      ).data,
    enabled: !!watched,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      const terminal =
        state === "completed" || state === "failed" || state === "not_found";
      if (terminal || !watched || Date.now() > watched.deadline) return false;
      return STATUS_POLL_INTERVAL_MS;
    },
  });

  const runCronMut = useAdminMutation(
    (key: string) =>
      adminApi.post("/admin/test-tools/run-cron", { key }).then((r) => r.data),
    {
      errorMessage: t("admin.system.testTools.cronError"),
      // Tetikleme asenkron: yanıt kuyruk fişidir; akıbet statusQuery'de.
      onSuccess: (data, key) => {
        toast.success(
          t("admin.system.testTools.cronQueued", { jobId: data.jobId }),
        );
        const cron = crons.find((c) => c.key === key);
        setWatched({
          key,
          label: cron?.label ?? key,
          jobId: String(data.jobId),
          deadline: Date.now() + STATUS_WATCH_MS,
        });
      },
    },
  );

  const askRun = async (cron: CronDef) => {
    await confirm({
      title: t("admin.system.testTools.cronConfirmTitle"),
      confirmLabel: t("admin.system.testTools.run"),
      description: (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            {t("admin.system.testTools.cronConfirmDescription", {
              label: cron.label,
            })}
          </p>
          {isProd && (
            <p className="text-xs text-danger-700">
              {t("admin.system.testTools.cronProdWarning")}
            </p>
          )}
        </div>
      ),
      onConfirm: () => runCronMut.mutateAsync(cron.key),
    });
  };

  const statusLine = (() => {
    if (!watched) return null;
    const status = statusQuery.data;
    if (status?.state === "completed") {
      return {
        tone: "text-success-700",
        text: status.summary
          ? t("admin.system.testTools.cronResultDone", {
              summary: status.summary,
            })
          : t("admin.system.testTools.cronResultDoneNoSummary"),
      };
    }
    if (status?.state === "failed") {
      return {
        tone: "text-danger-700",
        text: t("admin.system.testTools.cronResultFailed", {
          reason: status.failedReason ?? "?",
        }),
      };
    }
    if (status?.state === "not_found") {
      return {
        tone: "text-muted",
        text: t("admin.system.testTools.cronResultNotFound"),
      };
    }
    if (Date.now() > watched.deadline) {
      return {
        tone: "text-muted",
        text: t("admin.system.testTools.cronResultPending"),
      };
    }
    return {
      tone: "text-muted",
      text: t("admin.system.testTools.cronResultRunning"),
      busy: true,
    };
  })();

  if (cronsQuery.isError) {
    return (
      <QueryErrorCard
        onRetry={() => void cronsQuery.refetch()}
        isRetrying={cronsQuery.isRefetching}
      />
    );
  }

  return (
    <SectionCard
      title={t("admin.system.testTools.cronsTitle")}
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">
        {t("admin.system.testTools.cronsDescription")}
      </p>
      {watched && statusLine && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-alt p-3 text-sm">
          {statusLine.busy && <Spinner size="sm" />}
          <span className="font-medium text-heading">{watched.label}:</span>
          <span className={statusLine.tone}>{statusLine.text}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {crons.map((c) => (
          <div
            key={c.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-heading">{c.label}</p>
              <p className="text-xs text-muted">{c.description}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void askRun(c)}
              isLoading={runCronMut.isPending && runCronMut.variables === c.key}
            >
              {t("admin.system.testTools.run")}
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
