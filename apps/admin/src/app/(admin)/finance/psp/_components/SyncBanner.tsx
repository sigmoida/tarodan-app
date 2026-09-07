/** @format */

"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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

  const cls =
    tone === "danger"
      ? "border-danger-200 bg-danger-50 text-danger-700"
      : "border-warning-200 bg-warning-50 text-warning-700";

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}
    >
      <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
