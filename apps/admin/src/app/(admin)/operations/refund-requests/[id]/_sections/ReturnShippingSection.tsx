"use client";

import { useTranslations } from "next-intl";
import {
  StatusBadge,
  enumLabel,
  shipmentStatusConfig,
  shipmentProviderConfig,
} from "@tarodan/ui";
import { payerLabel } from "../_lib/refund-guidance";
import { SectionCard } from "@/components/detail/SectionCard";
import type { RefundRequestDetail } from "../types";
import { fmtDate } from "../_lib/format";
import { Field } from "../_components/Field";

export function ReturnShippingSection({ rr }: { rr: RefundRequestDetail }) {
  const t = useTranslations();
  const payer = rr.returnShippingPayer
    ? payerLabel(t, rr.returnShippingPayer)
    : null;
  const providerLabel =
    rr.returnProvider === "manual"
      ? t("admin.operations.refundRequests.manual")
      : enumLabel(
          shipmentProviderConfig,
          rr.returnProvider ?? undefined,
          rr.returnProvider ?? "—",
        );

  return (
    <SectionCard
      title={t("admin.operations.refundRequests.returnShippingTitle")}
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-muted">
        {t("admin.operations.refundRequests.returnShippingIntro")}
      </p>

      <div className="rounded-lg bg-surface-alt p-3 text-sm">
        <span className="font-medium text-body">
          {t("admin.operations.refundRequests.payerQuestion")}{" "}
        </span>
        {payer ? (
          <>
            <span className="font-semibold">{payer.label}</span>
            <span className="text-muted"> — {payer.helper}</span>
          </>
        ) : (
          <span className="text-muted">
            {t("admin.operations.refundRequests.payerNotSet")}
          </span>
        )}
      </div>

      {rr.returnTrackingNumber ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          <Field label={t("admin.operations.refundRequests.carrierCompany")}>
            {providerLabel}
          </Field>
          <Field label={t("admin.operations.common.trackingNumber")}>
            <span className="font-mono">
              {rr.returnProviderTrackingId ?? rr.returnTrackingNumber}
            </span>
          </Field>
          <Field label={t("admin.operations.refundRequests.shipmentStatus")}>
            {rr.returnStatus ? (
              <StatusBadge
                status={rr.returnStatus}
                config={shipmentStatusConfig}
              />
            ) : (
              "—"
            )}
          </Field>
          <Field label={t("admin.operations.refundRequests.shipmentCreated")}>
            {fmtDate(rr.returnCreatedAt)}
          </Field>
          <Field label={t("admin.operations.refundRequests.shippedAt")}>
            {fmtDate(rr.returnShippedAt)}
          </Field>
          <Field label={t("admin.operations.refundRequests.deliveredToSeller")}>
            {fmtDate(rr.returnDeliveredAt)}
          </Field>
        </div>
      ) : (
        <div className="text-sm text-muted">
          {t("admin.operations.refundRequests.noReturnShipment")}
        </div>
      )}
    </SectionCard>
  );
}
