"use client";

import { Alert, enumLabel, refundReasonConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { cancelReasonLabel } from "@/lib/utils";
import {
  adminCancelReasonLabel,
  platformCancelReasonCode,
} from "@/lib/admin-cancel-reasons";
import { SectionCard } from "@/components/detail/SectionCard";
import type { TradeDetail } from "../types";
import { statusConfig } from "@/lib/statusLabels";

/** Rejection/cancellation reason + admin notes + legacy dispute cards. */
export function TradeInfoCards({ trade }: { trade: TradeDetail }) {
  const t = useTranslations();
  // Platform (admin) iptali: neden katalog kodundan, admin'in dilinde. Ham
  // `cancelReason` taraflara gösterilen (varsayılan dilde) metindir; iç not
  // takasta değil denetim kaydındadır.
  const platformCode = platformCancelReasonCode(trade);
  const rawReason = platformCode
    ? null
    : trade.rejectionReason || trade.cancellationReason || trade.cancelReason;
  const shortReason = trade.rejectionReason
    ? null
    : cancelReasonLabel(trade.cancellationReason || trade.cancelReason, t);

  return (
    <>
      {platformCode && (
        <Alert
          variant="danger"
          title={t("admin.operations.trades.adminCancel.cancelledByPlatform")}
        >
          <p>
            <span className="font-medium">
              {t("admin.operations.trades.cancelReason")}:
            </span>{" "}
            {adminCancelReasonLabel(platformCode, t)}
          </p>
        </Alert>
      )}

      {rawReason && (
        <Alert
          variant="danger"
          title={
            trade.rejectionReason
              ? t("admin.operations.trades.rejectReason")
              : t("admin.operations.trades.cancelReason")
          }
        >
          {shortReason && shortReason !== rawReason && (
            <p className="mb-1 font-medium">{shortReason}</p>
          )}
          <p className="whitespace-pre-wrap">{rawReason}</p>
        </Alert>
      )}

      {trade.adminNotes && (
        <Alert variant="info" title={t("admin.operations.trades.adminNotes")}>
          <p className="whitespace-pre-wrap">{trade.adminNotes}</p>
        </Alert>
      )}

      {trade.dispute && (
        <SectionCard title={t("admin.operations.trades.dispute")}>
          <div className="space-y-2">
            <p>
              <span className="font-medium">
                {t("admin.operations.trades.reason")}:
              </span>{" "}
              {enumLabel(
                statusConfig(refundReasonConfig, t),
                trade.dispute.reason,
                trade.dispute.reason,
              )}
            </p>
            {trade.dispute.description && (
              <p>
                <span className="font-medium">{t("common.description")}:</span>{" "}
                {trade.dispute.description}
              </p>
            )}
            {trade.dispute.resolution && (
              <Alert variant="success" className="mt-3 p-3">
                <p>
                  <strong>{t("admin.operations.trades.resolution")}:</strong>{" "}
                  {trade.dispute.resolution}
                </p>
              </Alert>
            )}
          </div>
        </SectionCard>
      )}
    </>
  );
}
