/** @format */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { ExportButton, ResourceList } from "@/components/list";
import { useSession } from "@/context/SessionContext";
import { transferColumns } from "../_lib/columns";
import { type PayoutTransferRow } from "../_lib/types";
import { payoutTransferFilterFields } from "../_lib/filters";
import { canResolvePayoutTransfers } from "../_lib/resolution";
import { usePayoutTransferAction } from "../_hooks/usePayoutTransferAction";
import { RetryTransferModal } from "../_modals/RetryTransferModal";
import { MarkPaidModal } from "../_modals/MarkPaidModal";
import { TransferDetails } from "./TransferDetails";

type Dialog = { kind: "retry" | "markPaid"; row: PayoutTransferRow } | null;

/**
 * Gerçek banka transferleri (PayoutTransfer). Escrow hold listesinden AYRI:
 * burada paranın satıcının hesabına gerçekten geçip geçmediği görünür. A row
 * opens to the details an admin resolves it with (PayTR transaction ID,
 * reason, PayTR's message, the transfer-total breakdown, a manual
 * settlement). Super admins and admins may retry a failed or returned
 * transfer (a transfer PayTR may have taken only after the PayTR panel
 * check) and mark one as paid when the API offers a method.
 */
export function TransfersTab() {
  const t = useTranslations();
  const { user } = useSession();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const retry = usePayoutTransferAction(
    (transferId: string) => adminApi.retryPayoutTransfer(transferId),
    {
      onSuccess: () =>
        toast.success(t("admin.finance.payouts.transferRetried")),
    },
  );

  const columns = transferColumns(
    canResolvePayoutTransfers(user?.role)
      ? {
          onRetry: (row) =>
            row.resolution?.retryRequiresProviderCheck
              ? setDialog({ kind: "retry", row })
              : retry.submit(row.id),
          onMarkPaid: (row) => setDialog({ kind: "markPaid", row }),
          retryingId: retry.pendingVars,
        }
      : undefined,
    t,
  );

  return (
    <ResourceList<PayoutTransferRow>
      resource="payouts-transfers"
      fetcher={(p) =>
        adminApi
          .getPayoutTransfers({
            status: p.status,
            search: p.search,
            dateFrom: p.dateFrom,
            dateTo: p.dateTo,
            page: p.page,
            limit: p.limit,
          })
          .then((res) => ({
            ...res,
            data: {
              data: res.data?.items ?? [],
              meta: { total: res.data?.total ?? 0 },
            },
          }))
      }
      getRowId={(r) => r.id}
      syncUrl
      filters={payoutTransferFilterFields(t)}
    >
      <ResourceList.Toolbar>
        <ExportButton fetcher={(p) => adminApi.exportPayoutTransfers(p)} />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText={t("admin.finance.payouts.empty")}
        onRowClick={(row) =>
          setExpandedId((open) => (open === row.id ? null : row.id))
        }
        expandedId={expandedId}
        renderExpanded={(row) => <TransferDetails row={row} />}
      />
      <ResourceList.Pagination />
      {dialog?.kind === "retry" && (
        <RetryTransferModal
          key={dialog.row.id}
          row={dialog.row}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "markPaid" && (
        <MarkPaidModal
          key={dialog.row.id}
          row={dialog.row}
          onClose={() => setDialog(null)}
        />
      )}
    </ResourceList>
  );
}
