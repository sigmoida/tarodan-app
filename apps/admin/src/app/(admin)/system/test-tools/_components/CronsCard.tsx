"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@tarodan/ui";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { type CronDef } from "../_lib/types";
import { useTranslations } from "next-intl";

/** Manually trigger scheduled jobs (harmless: only runs work that would run anyway). */
export function CronsCard() {
  const t = useTranslations();
  const cronsQuery = useQuery<CronDef[]>({
    queryKey: adminKeys.all("test-tools-crons"),
    queryFn: async () => (await adminApi.get("/admin/test-tools/crons")).data,
  });
  const crons = cronsQuery.data ?? [];

  const runCronMut = useAdminMutation(
    (key: string) =>
      adminApi.post("/admin/test-tools/run-cron", { key }).then((r) => r.data),
    {
      errorMessage: t("admin.system.testTools.cronError"),
      // Tetikleme artık asenkron: yanıt sonucu değil kuyruk fişini döner.
      onSuccess: (data) =>
        toast.success(
          t("admin.system.testTools.cronQueued", { jobId: data.jobId }),
        ),
    },
  );

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
              onClick={() => runCronMut.mutate(c.key)}
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
