"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@tarodan/ui";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { useConfirm } from "@/provider/ConfirmProvider";
import { type CronDef } from "../_lib/types";
import { useTranslations } from "next-intl";

/** cron-status polling: ~5 deneme × 2sn — çoğu iş bu pencerede biter. */
const STATUS_POLL_ATTEMPTS = 5;
const STATUS_POLL_INTERVAL_MS = 2000;

interface CronStatus {
  state: string;
  summary: string | null;
  failedReason: string | null;
}

/**
 * Zamanlanmış işleri elle tetikler (yalnız CRON_CATALOG.triggerable olanlar).
 *
 * İki koruma: (1) tetikleme onay penceresinden geçer — prod'da gerçek veri
 * uyarısıyla (TimeAdjustCard ile aynı desen); (2) "kuyruğa alındı" son söz
 * değildir — fişin akıbeti cron-status ucundan birkaç kez sorgulanır ve
 * gerçek sonuç (bitti/hata/hâlâ çalışıyor) toast'lanır. Worker kapalıysa iş
 * kuyrukta bekler; polling "hâlâ çalışıyor" der, admin başarılı sanmaz.
 */
export function CronsCard({ isProd }: { isProd: boolean }) {
  const t = useTranslations();
  const confirm = useConfirm();
  // Unmount sonrası setTimeout zinciri toast atmasın.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const cronsQuery = useQuery<CronDef[]>({
    queryKey: adminKeys.all("test-tools-crons"),
    queryFn: async () => (await adminApi.get("/admin/test-tools/crons")).data,
  });
  const crons = cronsQuery.data ?? [];

  const pollStatus = async (jobId: string) => {
    for (let i = 0; i < STATUS_POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, STATUS_POLL_INTERVAL_MS));
      if (!aliveRef.current) return;
      let status: CronStatus;
      try {
        status = (
          await adminApi.get("/admin/test-tools/cron-status", {
            params: { jobId },
          })
        ).data;
      } catch {
        continue; // geçici ağ hatası — sıradaki denemede tekrar sor
      }
      if (!aliveRef.current) return;
      if (status.state === "completed") {
        toast.success(
          status.summary
            ? t("admin.system.testTools.cronResultDone", {
                summary: status.summary,
              })
            : t("admin.system.testTools.cronResultDoneNoSummary"),
        );
        return;
      }
      if (status.state === "failed") {
        toast.error(
          t("admin.system.testTools.cronResultFailed", {
            reason: status.failedReason ?? "?",
          }),
        );
        return;
      }
      if (status.state === "not_found") break;
    }
    if (aliveRef.current) {
      toast(t("admin.system.testTools.cronResultPending"));
    }
  };

  const runCronMut = useAdminMutation(
    (key: string) =>
      adminApi.post("/admin/test-tools/run-cron", { key }).then((r) => r.data),
    {
      errorMessage: t("admin.system.testTools.cronError"),
      // Tetikleme asenkron: yanıt kuyruk fişidir; gerçek sonuç polling'den gelir.
      onSuccess: (data) => {
        toast.success(
          t("admin.system.testTools.cronQueued", { jobId: data.jobId }),
        );
        void pollStatus(String(data.jobId));
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
