"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { UAT_REFRESH_CONFIRM_PHRASE } from "@tarodan/types";
import { Alert, Button, Spinner } from "@tarodan/ui";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { TextLink } from "@/components/TextLink";
import { usePermissions } from "@/context/PermissionsContext";
import {
  runDurationText,
  uatRefreshHistoryColumns,
} from "../_lib/uatRefreshColumns";
import { useUatRefresh } from "../_lib/useUatRefresh";
import { UatRefreshStartModal } from "./UatRefreshStartModal";
import { UatRefreshSummary } from "./UatRefreshSummary";

const BASE = "admin.system.testTools.uatRefresh";

/**
 * "Staging verisi": staging'i canlının maskelenmiş kopyasıyla yeniler. Yalnız
 * super_admin görür (API de öyle); canlıda hiç çizilmez. İş GitHub Actions'ta
 * koşar — burada durum yoklanır, takas sırasında API'nin düşmesi beklenir.
 */
export function UatRefreshCard() {
  const { isSuperAdmin } = usePermissions();
  if (!isSuperAdmin) return null;
  return <UatRefreshPanel />;
}

function UatRefreshPanel() {
  const t = useTranslations();
  const { status, phase, refetch, isRefetching, start } = useUatRefresh();
  const [modalOpen, setModalOpen] = useState(false);
  const now = Date.now();

  if (phase === "hidden") return null;

  const busy = phase === "active" || phase === "swapping";
  const current = status?.current ?? null;
  const runUrl =
    current?.workflowRunUrl ?? status?.last?.workflowRunUrl ?? null;
  const canStart = phase === "idle" && !start.isPending;

  return (
    <SectionCard
      title={t(`${BASE}.title`)}
      actions={
        phase !== "notConfigured" && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setModalOpen(true)}
            disabled={!canStart}
            isLoading={start.isPending}
          >
            {t(`${BASE}.action`)}
          </Button>
        )
      }
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">{t(`${BASE}.description`)}</p>

      {phase === "loading" && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      )}

      {phase === "notConfigured" && (
        <Alert variant="default">{t(`${BASE}.notConfigured`)}</Alert>
      )}

      {phase === "error" && (
        <Alert
          variant="danger"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={refetch}
              isLoading={isRefetching}
            >
              {t(`${BASE}.retry`)}
            </Button>
          }
        >
          {t(`${BASE}.loadFailed`)}
        </Alert>
      )}

      {busy && (
        <Alert variant="warning" title={t(`${BASE}.active.title`)}>
          <div className="space-y-1 text-sm">
            <p>
              {phase === "swapping"
                ? t(`${BASE}.active.swapping`)
                : t(`${BASE}.active.body`)}
            </p>
            {current && (
              <p>
                {t(`${BASE}.active.elapsed`, {
                  duration: runDurationText(current, now, t),
                })}
              </p>
            )}
            {runUrl && (
              <p>
                <TextLink href={runUrl} external>
                  {t(`${BASE}.last.openRun`)}
                </TextLink>
              </p>
            )}
          </div>
        </Alert>
      )}

      {status?.available && !busy && (
        <>
          {status.last ? (
            <UatRefreshSummary run={status.last} now={now} />
          ) : (
            <p className="text-sm text-muted">{t(`${BASE}.last.none`)}</p>
          )}
        </>
      )}

      {status?.available && (
        <div className="space-y-2 border-t border-border pt-4">
          <SectionTitle as="h3" size="sm">
            {t(`${BASE}.history.title`)}
          </SectionTitle>
          <DataTable
            dense
            columns={uatRefreshHistoryColumns(t, now)}
            data={status.history.slice(0, 10)}
            getRowId={(r) => r.id}
            emptyText={t(`${BASE}.history.empty`)}
          />
        </div>
      )}

      <UatRefreshStartModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        isSubmitting={start.isPending}
        onSubmit={(values) =>
          start.mutate(
            { confirm: UAT_REFRESH_CONFIRM_PHRASE, dryRun: values.dryRun },
            { onSuccess: () => setModalOpen(false) },
          )
        }
      />
    </SectionCard>
  );
}
