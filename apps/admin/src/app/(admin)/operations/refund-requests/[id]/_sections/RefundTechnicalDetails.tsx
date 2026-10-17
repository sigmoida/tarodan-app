"use client";

import { useTranslations } from "next-intl";
import type { HistoryEntry, RefundRequestDetail } from "../types";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";

export function RefundTechnicalDetails({
  rr,
  history,
}: {
  rr: RefundRequestDetail;
  history: HistoryEntry[];
}) {
  const t = useTranslations();
  return (
    <Panel>
      <details>
        <summary className="cursor-pointer select-none text-sm font-medium text-muted">
          {t("admin.operations.refundRequests.technicalDetails")}
        </summary>
        <div className="mt-4 space-y-2 text-xs">
          <DataList columns={1}>
            <Field label={t("admin.operations.refundRequests.requestId")} mono>
              {rr.id || "—"}
            </Field>
            <Field
              label={t("admin.operations.refundRequests.returnProviderRaw")}
              mono
            >
              {rr.returnProvider || "—"}
            </Field>
            <Field
              label={t("admin.operations.refundRequests.providerRefundId")}
              mono
            >
              {rr.providerRefundId || "—"}
            </Field>
          </DataList>
          {history.length > 0 && (
            <div>
              <div className="mb-1 font-medium text-body">
                {t("admin.operations.refundRequests.rawHistory")}
              </div>
              <Panel tone="muted" padding="sm">
                <pre className="overflow-x-auto whitespace-pre-wrap text-muted">
                  {JSON.stringify(history, null, 2)}
                </pre>
              </Panel>
            </div>
          )}
        </div>
      </details>
    </Panel>
  );
}
