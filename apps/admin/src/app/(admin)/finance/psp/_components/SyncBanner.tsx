/** @format */

"use client";

import { Alert } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { fmtDateTime } from "@/lib/format";
import type { PspSyncState } from "../_lib/types";

/**
 * Senkron sağlığı — üç sekmenin üstünde tek şerit. Eskiden "bayrak kapalı",
 * "dün çöktü", "bayat" ve "gerçekten boş" aynı boş tabloya düşüyordu.
 */
export function SyncBanner({ sync }: { sync: PspSyncState | undefined }) {
  const t = useTranslations();
  if (!sync) return null;

  const tone = !sync.enabled
    ? "warning"
    : sync.statement?.status === "error" || sync.settlement?.status === "error"
      ? "danger"
      : sync.stale
        ? "warning"
        : "ok";

  if (tone === "ok") {
    return (
      <p className="text-xs text-muted">
        {t("admin.finance.psp.sync.lastOk", {
          at: fmtDateTime(sync.statement?.at) ?? "—",
        })}
      </p>
    );
  }

  const message = !sync.enabled
    ? t("admin.finance.psp.sync.disabled")
    : tone === "danger"
      ? t("admin.finance.psp.sync.error", {
          error:
            sync.statement?.status === "error"
              ? (sync.statement.error ?? "")
              : (sync.settlement?.error ?? ""),
        })
      : t("admin.finance.psp.sync.stale", {
          at: fmtDateTime(sync.statement?.at) ?? "—",
        });

  return (
    <Alert role="status" variant={tone}>
      {message}
    </Alert>
  );
}
