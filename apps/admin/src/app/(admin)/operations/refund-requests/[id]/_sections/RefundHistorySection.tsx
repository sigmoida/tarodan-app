"use client";

import { useTranslations } from "next-intl";
import { refundActionLabel } from "../_lib/refund-guidance";
import { SectionCard } from "@/components/detail/SectionCard";
import type { HistoryEntry } from "../types";
import { fmtDate } from "../_lib/format";

export function RefundHistorySection({ history }: { history: HistoryEntry[] }) {
  const t = useTranslations();
  if (history.length === 0) return null;

  return (
    <SectionCard title={t("admin.operations.refundRequests.historyTitle")}>
      <ol className="space-y-3">
        {history
          .slice()
          .reverse()
          .map((h, i) => {
            const a = refundActionLabel(t, h.action);
            return (
              <li key={i} className="border-l-2 border-primary-200 py-1 pl-4">
                <div className="text-sm font-medium text-body">{a.label}</div>
                <div className="text-xs text-muted">
                  {fmtDate(h.at)} — {a.actor}
                </div>
              </li>
            );
          })}
      </ol>
    </SectionCard>
  );
}
