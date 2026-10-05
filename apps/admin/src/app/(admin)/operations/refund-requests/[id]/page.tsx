"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Alert, StatusBadge, refundRequestStatusConfig } from "@tarodan/ui";
import { ADMIN_REFUNDS_VIEW_HREF } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useSession } from "@/context/SessionContext";
import { DetailPage } from "@/components/detail/DetailPage";
import { TestLaneBadge } from "@/components/TestLaneBadge";
import { PartyCard } from "@/components/detail/PartyCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { RefundStatusStepper } from "./_components/RefundStatusStepper";
import { FinancialComponentsTable } from "./_components/FinancialComponentsTable";
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

/**
 * Hold'u donduran (açık) iade durumları — bunlarda para iade ETMEDEN kapatma
 * uçtan (POST /admin/refund-requests/:id/close) yapılabilir. Şubeye hiç
 * götürülmeyen bir iadenin panelden tek çıkışı budur; `force-finalize` yalnız
 * `return_delivered`/`disputed` kabul eder.
 */
const CLOSABLE_STATUSES = [
  "approved",
  "wait_for_delivery",
  "return_shipment_open",
  "return_in_transit",
  "return_delivered",
  "disputed",
];

export default function RefundRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const confirm = useConfirm();
  const { user } = useSession();
  // Uç @Roles(super_admin, admin); moderatöre gösterilirse buton 403 üretirdi.
  const canUseClose = user.role === "super_admin" || user.role === "admin";

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
  const closeStuck = useAdminMutation(
    (reason: string) => adminApi.closeStuckRefund(id, reason),
    {
      // Kapatma iki listeyi daha etkiler: sipariş yeniden tamamlanabilir hâle
      // gelir ve satıcının hold'u ödeme takvimine geri düşer.
      invalidates: ["refund-requests", "refunds", "orders", "payouts-schedule"],
      successMessage: t("admin.operations.refundRequests.closed"),
    },
  );
  const handleClose = async (reason: string) => {
    await confirm({
      description: t("admin.operations.refundRequests.closeConfirmPrompt"),
      destructive: true,
      onConfirm: () => closeStuck.mutateAsync(reason),
    });
  };
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
      backHref={ADMIN_REFUNDS_VIEW_HREF}
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
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={rr.status}
            config={statusConfig(refundRequestStatusConfig, t)}
          />
          <TestLaneBadge isTest={rr.order.isTest} />
        </div>
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
        // Para iade etmeden kapatma: hold'u donduran her canlı yaşam döngüsü
        // durumu. `pending_review` dışarıda — orada zaten "Reddet" var.
        const canClose =
          canUseClose &&
          CLOSABLE_STATUSES.includes(rr.status) &&
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
              canClose={canClose}
              closing={closeStuck.isPending}
              onClose={handleClose}
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
              <SectionCard
                title={t("admin.operations.refundRequests.decisionV2.title")}
              >
                <FinancialComponentsTable components={rr.financialComponents} />
              </SectionCard>
            )}

            {rr.refundedAt && (
              <Alert
                variant="success"
                icon={<CheckCircleIcon className="h-6 w-6" />}
                title={t(
                  "admin.operations.refundRequests.refundCompletedAmount",
                  {
                    amount: fmtTry(rr.amount),
                  },
                )}
              >
                {fmtDate(rr.refundedAt)}
              </Alert>
            )}

            <RefundHistorySection history={history} />
            <RefundTechnicalDetails rr={rr} history={history} />
          </>
        );
      }}
    </DetailPage>
  );
}
