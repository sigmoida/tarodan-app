"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { StatusBadge, refundRequestStatusConfig } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { DetailPage } from "@/components/detail/DetailPage";
import { PartyCard } from "@/components/detail/PartyCard";
import { RefundStatusStepper } from "./_components/RefundStatusStepper";
import { RefundNextActionPanel } from "./_components/RefundNextActionPanel";
import type {
  HistoryEntry,
  RefundDecisionPreview,
  RefundRequestDetail,
} from "./types";
import { fmtDate, fmtTry } from "./_lib/format";
import { RefundReasonSection } from "./_sections/RefundReasonSection";
import { ReturnShippingSection } from "./_sections/ReturnShippingSection";
import { RefundHistorySection } from "./_sections/RefundHistorySection";
import { RefundTechnicalDetails } from "./_sections/RefundTechnicalDetails";
import { statusConfig } from "@/lib/statusLabels";

export default function RefundRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const confirm = useConfirm();

  const forceFinalize = useAdminMutation(
    () => adminApi.forceFinalizeRefund(id),
    {
      invalidates: ["refund-requests", "refunds"],
      successMessage: t("admin.operations.refundRequests.refundCompleted"),
    },
  );
  const approveReview = useAdminMutation(
    (body: {
      note?: string;
      resolvedReason?: string;
      faultParty?: string;
      calculationToken?: string;
    }) => adminApi.approveRefundRequest(id, body),
    {
      invalidates: ["refund-requests", "refunds"],
      successMessage: t("admin.operations.refundRequests.reviewApproved"),
    },
  );
  const rejectReview = useAdminMutation(
    (reason: string) => adminApi.rejectRefundRequest(id, reason),
    {
      invalidates: ["refund-requests", "refunds"],
      successMessage: t("admin.operations.refundRequests.reviewRejected"),
    },
  );
  const markDisputed = useAdminMutation(
    (note: string) => adminApi.markRefundDisputed(id, note),
    {
      invalidates: ["refund-requests", "refunds"],
      successMessage: t("admin.operations.refundRequests.disputeMarked"),
    },
  );
  const handleForceFinalize = async () => {
    await confirm({
      description: t("admin.operations.refundRequests.forceFinalizeConfirm"),
      destructive: true,
      onConfirm: () => forceFinalize.mutateAsync(),
    });
  };

  return (
    <DetailPage<RefundRequestDetail>
      resource="refund-requests"
      id={id}
      fetcher={(rid) =>
        adminApi.getRefundRequest(rid).then((r) => r.data?.data ?? r.data)
      }
      backHref="/operations/refund-requests"
      emptyTitle={t("admin.operations.refundRequests.notFound")}
      title={(rr) => (
        <>
          {t("admin.operations.refundRequests.detailTitle")}
          {rr.refundNumber && <span className="ml-2">#{rr.refundNumber}</span>}
        </>
      )}
      subtitle={(rr) =>
        t("admin.operations.refundRequests.detailSubtitle", {
          date: fmtDate(rr.createdAt),
          amount: fmtTry(rr.amount),
        })
      }
      badge={(rr) => (
        <StatusBadge
          status={rr.status}
          config={statusConfig(refundRequestStatusConfig, t)}
        />
      )}
    >
      {(rr) => {
        const canForceFinalize =
          (rr.status === "return_delivered" || rr.status === "disputed") &&
          !rr.refundedAt;
        const canDispute =
          (rr.status === "return_in_transit" ||
            rr.status === "return_delivered") &&
          !rr.refundedAt;
        const history: HistoryEntry[] = Array.isArray(rr.metadata?.history)
          ? (rr.metadata!.history as HistoryEntry[])
          : [];
        return (
          <>
            <RefundStatusStepper status={rr.status} />

            <RefundNextActionPanel
              status={rr.status}
              reason={rr.reason}
              shipmentStatus={rr.order.shipment?.status ?? null}
              policyVersion={rr.policyVersion ?? 1}
              policyFinalizedAt={rr.policyFinalizedAt ?? null}
              financialReviewRequired={rr.financialReviewRequired ?? false}
              amount={Number(rr.amount)}
              canForceFinalize={canForceFinalize}
              finalizing={forceFinalize.isPending}
              onFinalize={handleForceFinalize}
              canDispute={canDispute}
              disputing={markDisputed.isPending}
              onDispute={(note) => markDisputed.mutate(note)}
              reviewing={approveReview.isPending || rejectReview.isPending}
              onPreview={async (decision) => {
                const response = await adminApi.previewRefundDecision(
                  id,
                  decision,
                );
                return (response.data?.data ??
                  response.data) as RefundDecisionPreview;
              }}
              onApprove={(body) => approveReview.mutate(body)}
              onReject={(reason) => rejectReview.mutate(reason)}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PartyCard
                title={t("admin.operations.refundRequests.buyerRequester")}
                name={rr.requester.displayName}
                userHref={`/accounts/users/${rr.requester.id}`}
                email={rr.requester.email}
                phone={rr.requester.phone}
              />
              <PartyCard
                title={t("admin.operations.common.seller")}
                name={rr.order.seller.displayName}
                userHref={`/accounts/users/${rr.order.seller.id}`}
                email={rr.order.seller.email}
                phone={rr.order.seller.phone}
              />
            </div>

            <RefundReasonSection rr={rr} />
            <ReturnShippingSection rr={rr} />

            {!!rr.financialComponents?.length && (
              <section className="rounded-xl border bg-surface-elevated p-4">
                <h2 className="mb-3 text-base font-semibold">
                  {t("admin.operations.refundRequests.decisionV2.title")}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th className="pb-2 pr-3">
                          {t(
                            "admin.operations.refundRequests.decisionV2.component",
                          )}
                        </th>
                        <th className="pb-2 pr-3">
                          {t(
                            "admin.operations.refundRequests.decisionV2.treatment",
                          )}
                        </th>
                        <th className="pb-2 pr-3">
                          {t("admin.operations.refundRequests.decisionV2.net")}
                        </th>
                        <th className="pb-2 pr-3">
                          {t("admin.operations.refundRequests.decisionV2.tax")}
                        </th>
                        <th className="pb-2">
                          {t(
                            "admin.operations.refundRequests.decisionV2.gross",
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rr.financialComponents.map((component) => (
                        <tr
                          key={`${component.componentCode}:${component.treatment}`}
                          className="border-t"
                        >
                          <td className="py-2 pr-3">
                            {component.componentCode}
                          </td>
                          <td className="py-2 pr-3">{component.treatment}</td>
                          <td className="py-2 pr-3">
                            {fmtTry(component.netAmount)}
                          </td>
                          <td className="py-2 pr-3">
                            {fmtTry(component.taxAmount)}
                          </td>
                          <td className="py-2">
                            {fmtTry(component.grossAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {rr.refundedAt && (
              <div className="rounded-xl border border-success-200 bg-success-50 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-success-600" />
                  <div>
                    <div className="font-semibold text-success-900">
                      {t(
                        "admin.operations.refundRequests.refundCompletedAmount",
                        {
                          amount: fmtTry(rr.amount),
                        },
                      )}
                    </div>
                    <div className="text-sm text-success-800">
                      {fmtDate(rr.refundedAt)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <RefundHistorySection history={history} />
            <RefundTechnicalDetails rr={rr} history={history} />
          </>
        );
      }}
    </DetailPage>
  );
}
