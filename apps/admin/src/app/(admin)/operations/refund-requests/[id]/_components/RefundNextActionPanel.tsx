"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Select,
  Textarea,
  refundReasonConfig,
  enumLabel,
} from "@tarodan/ui";
import { fmtTry } from "@/lib/format";
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import {
  guidanceForStatus,
  type GuidanceVariant,
} from "../_lib/refund-guidance";
import type { RefundDecisionPreview } from "../types";
import { extractErrorMessage } from "@/lib/error";

// Tek doğru kaynak: @tarodan/shared refundReasonConfig (11 enum değeri).
// Elle kopyalanan liste sessizce kayıyordu.
const REFUND_REASONS = Object.keys(refundReasonConfig);

const VARIANT_ICON: Record<GuidanceVariant, React.ReactNode> = {
  info: <InformationCircleIcon className="h-6 w-6" />,
  warning: <ExclamationTriangleIcon className="h-6 w-6" />,
  success: <CheckCircleIcon className="h-6 w-6" />,
  danger: <XCircleIcon className="h-6 w-6" />,
  default: <InformationCircleIcon className="h-6 w-6" />,
};

export interface RefundNextActionPanelProps {
  status: string;
  reason: string;
  shipmentStatus: string | null;
  policyVersion: number;
  policyFinalizedAt: string | null;
  financialReviewRequired: boolean;
  amount: number;
  canForceFinalize: boolean;
  finalizing: boolean;
  onFinalize: () => void;
  /** O3: satıcı inceleme penceresinde itiraz — 24s otomatik finalize durur. */
  canDispute: boolean;
  disputing: boolean;
  onDispute: (note: string) => void;
  reviewing: boolean;
  onPreview: (decision: {
    resolvedReason: string;
    faultParty: string;
  }) => Promise<RefundDecisionPreview>;
  onApprove: (body: {
    note?: string;
    resolvedReason?: string;
    faultParty?: string;
    calculationToken?: string;
  }) => void;
  onReject: (reason: string) => void;
}

/**
 * "What should you do now?" panel — a plain status summary per state,
 * whether action is needed, and (if so) a single primary action button.
 */
export function RefundNextActionPanel({
  status,
  reason,
  shipmentStatus,
  policyVersion,
  policyFinalizedAt,
  financialReviewRequired,
  amount,
  canForceFinalize,
  finalizing,
  onFinalize,
  canDispute,
  disputing,
  onDispute,
  reviewing,
  onPreview,
  onApprove,
  onReject,
}: RefundNextActionPanelProps) {
  const t = useTranslations();
  const guidance = guidanceForStatus(t, status);
  const [reviewNote, setReviewNote] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");
  const [resolvedReason, setResolvedReason] = useState(reason);
  const carrierHasPackage =
    shipmentStatus != null &&
    !["pending", "label_created", "cancelled", "failed"].includes(
      shipmentStatus,
    );
  const [faultParty, setFaultParty] = useState(
    reason === "lost_in_transit" ||
      (reason === "delivery_delayed" && carrierHasPackage)
      ? "carrier"
      : "seller",
  );
  const [preview, setPreview] = useState<RefundDecisionPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const isV2 = policyVersion >= 2;
  // financialReviewRequired covers both quarantined legacy money effects and
  // safe returns whose physical lifecycle was already in progress at migration.
  // Both need an explicit reason/fault preview. For a parcel already with the
  // carrier, backend finalizes only money and preserves the lifecycle status.
  const requiresV2Decision =
    (isV2 || financialReviewRequired) && !policyFinalizedAt;

  const refreshPreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      setPreview(await onPreview({ resolvedReason, faultParty }));
    } catch (error) {
      setPreview(null);
      setPreviewError(
        extractErrorMessage(
          error,
          t("admin.operations.refundRequests.decisionV2.previewError"),
        ),
      );
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert
        variant={guidance.variant}
        title={guidance.title}
        icon={VARIANT_ICON[guidance.variant]}
      >
        <div className="space-y-3">
          <p>{guidance.description}</p>

          {status === "refunded" && (
            <p className="font-semibold">
              {t("admin.operations.refundRequests.refundedAmountLabel", {
                amount: fmtTry(amount),
              })}
            </p>
          )}

          {(canForceFinalize || canDispute) && (
            <div className="flex flex-wrap items-start gap-2">
              {canForceFinalize && (
                <Button
                  variant="primary"
                  onClick={onFinalize}
                  isLoading={finalizing}
                  disabled={finalizing}
                >
                  <BanknotesIcon className="mr-1.5 h-5 w-5" />
                  {t("admin.operations.refundRequests.forceFinalizeButton")}
                </Button>
              )}
              {canDispute && !disputeOpen && (
                <Button
                  variant="secondary"
                  onClick={() => setDisputeOpen(true)}
                  disabled={disputing || finalizing}
                >
                  <ExclamationTriangleIcon className="mr-1.5 h-5 w-5" />
                  {t("admin.operations.refundRequests.disputeButton")}
                </Button>
              )}
            </div>
          )}

          {canDispute && disputeOpen && (
            <div className="space-y-2 rounded-lg border border-warning-200 bg-surface-elevated p-3">
              <Textarea
                value={disputeNote}
                placeholder={t(
                  "admin.operations.refundRequests.disputeNotePlaceholder",
                )}
                onChange={(event) =>
                  setDisputeNote(event.target.value.slice(0, 500))
                }
                rows={2}
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  onClick={() => onDispute(disputeNote.trim())}
                  isLoading={disputing}
                  disabled={disputing || disputeNote.trim().length < 10}
                >
                  {t("admin.operations.refundRequests.disputeConfirm")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setDisputeOpen(false)}
                  disabled={disputing}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}

          {(status === "pending_review" || requiresV2Decision) && (
            <div className="space-y-3">
              {financialReviewRequired && (
                <Alert variant="warning">
                  {t(
                    "admin.operations.refundRequests.decisionV2.quarantineWarning",
                  )}
                </Alert>
              )}
              {requiresV2Decision && (
                <div className="space-y-3 rounded-lg border border-warning-200 bg-surface-elevated p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label={t(
                        "admin.operations.refundRequests.decisionV2.resolvedReason",
                      )}
                      value={resolvedReason}
                      onChange={(event) => {
                        setResolvedReason(event.target.value);
                        setPreview(null);
                      }}
                      options={REFUND_REASONS.map((value) => ({
                        value,
                        label: enumLabel(refundReasonConfig, value),
                      }))}
                    />
                    <Select
                      label={t(
                        "admin.operations.refundRequests.decisionV2.faultParty",
                      )}
                      value={faultParty}
                      onChange={(event) => {
                        setFaultParty(event.target.value);
                        setPreview(null);
                      }}
                      options={(
                        ["buyer", "seller", "carrier", "platform"] as const
                      ).map((party) => ({
                        value: party,
                        label: t(
                          `admin.operations.refundRequests.decisionV2.${party}`,
                        ),
                      }))}
                    />
                  </div>
                  <Button
                    onClick={refreshPreview}
                    isLoading={previewing}
                    disabled={previewing || reviewing}
                  >
                    {t("admin.operations.refundRequests.decisionV2.preview")}
                  </Button>
                  {previewError && (
                    <p className="text-sm text-danger">{previewError}</p>
                  )}
                  {preview && (
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2 rounded-md bg-surface p-2">
                        <div>
                          {t(
                            "admin.operations.refundRequests.decisionV2.buyerRefund",
                            {
                              amount: fmtTry(
                                preview.financials.buyerRefundAmount,
                              ),
                            },
                          )}
                        </div>
                        <div>
                          {t(
                            "admin.operations.refundRequests.decisionV2.sellerImpact",
                            {
                              amount: fmtTry(
                                preview.financials.sellerNetEffectAmount,
                              ),
                            },
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr>
                              <th className="py-1 pr-2">
                                {t(
                                  "admin.operations.refundRequests.decisionV2.component",
                                )}
                              </th>
                              <th className="py-1 pr-2">
                                {t(
                                  "admin.operations.refundRequests.decisionV2.treatment",
                                )}
                              </th>
                              <th className="py-1 pr-2">
                                {t(
                                  "admin.operations.refundRequests.decisionV2.net",
                                )}
                              </th>
                              <th className="py-1 pr-2">
                                {t(
                                  "admin.operations.refundRequests.decisionV2.tax",
                                )}
                              </th>
                              <th className="py-1">
                                {t(
                                  "admin.operations.refundRequests.decisionV2.gross",
                                )}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.financials.components.map((component) => (
                              <tr
                                key={`${component.componentCode}:${component.treatment}`}
                                className="border-t"
                              >
                                <td className="py-1 pr-2">
                                  {component.componentCode}
                                </td>
                                <td className="py-1 pr-2">
                                  {component.treatment}
                                </td>
                                <td className="py-1 pr-2">
                                  {fmtTry(component.netAmount)}
                                </td>
                                <td className="py-1 pr-2">
                                  {fmtTry(component.taxAmount)}
                                </td>
                                <td className="py-1">
                                  {fmtTry(component.grossAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <label className="block text-sm font-medium">
                {t("admin.operations.refundRequests.reviewNote")}
              </label>
              <Textarea
                value={reviewNote}
                placeholder={t(
                  "admin.operations.refundRequests.reviewNotePlaceholder",
                )}
                onChange={(event) =>
                  setReviewNote(event.target.value.slice(0, 1000))
                }
                rows={3}
                maxLength={1000}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() =>
                    onApprove(
                      requiresV2Decision
                        ? {
                            note: reviewNote,
                            resolvedReason,
                            faultParty,
                            calculationToken: preview?.calculationToken,
                          }
                        : { note: reviewNote },
                    )
                  }
                  isLoading={reviewing}
                  disabled={
                    reviewing ||
                    (requiresV2Decision && !preview) ||
                    (financialReviewRequired && !reviewNote.trim())
                  }
                >
                  <CheckCircleIcon className="mr-1.5 h-5 w-5" />
                  {t(
                    financialReviewRequired && status !== "pending_review"
                      ? "admin.operations.refundRequests.decisionV2.finalizeFinancialReview"
                      : "admin.operations.refundRequests.approveButton",
                  )}
                </Button>
                {status === "pending_review" && (
                  <Button
                    variant="danger"
                    onClick={() => onReject(reviewNote)}
                    disabled={reviewing || !reviewNote.trim()}
                  >
                    <XCircleIcon className="mr-1.5 h-5 w-5" />
                    {t("admin.operations.refundRequests.rejectButton")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Alert>

      {reason === "counterfeit" && (
        <Alert
          variant="danger"
          title={t("admin.operations.refundRequests.counterfeitTitle")}
          icon={<ExclamationTriangleIcon className="h-6 w-6" />}
        >
          {t("admin.operations.refundRequests.counterfeitBody")}
        </Alert>
      )}
    </div>
  );
}
