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
import { fmtDate, fmtTry } from "../_lib/format";
import { Field } from "../_components/Field";
import { statusConfig } from "@/lib/statusLabels";

export function ReturnShippingSection({ rr }: { rr: RefundRequestDetail }) {
  const t = useTranslations();
  const payer = rr.returnShippingPayer
    ? payerLabel(t, rr.returnShippingPayer)
    : null;
  const providerLabel =
    rr.returnProvider === "manual"
      ? t("admin.operations.refundRequests.manual")
      : enumLabel(
          statusConfig(shipmentProviderConfig, t),
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

      {rr.policyCode && rr.policyCode !== "legacy" && (
        <>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <Field label={t("admin.operations.refundRequests.policyCode")}>
              <span className="font-mono">{rr.policyCode}</span>
            </Field>
            <Field label={t("admin.operations.refundRequests.returnDesi")}>
              {rr.returnBillableDesi ?? 1}
            </Field>
            <Field label={t("admin.operations.refundRequests.returnFee")}>
              {fmtTry(rr.returnShippingAmount ?? 0)}
            </Field>
            <Field label={t("admin.operations.refundRequests.productRefund")}>
              {fmtTry(rr.refundedProductAmount ?? 0)}
            </Field>
            <Field label={t("admin.operations.refundRequests.outboundRefund")}>
              {fmtTry(rr.refundedOutboundShippingAmount ?? 0)}
            </Field>
            <Field
              label={t("admin.operations.refundRequests.protectionRefund")}
            >
              {fmtTry(rr.refundedBuyerProtectionAmount ?? 0)}
            </Field>
            {/* Kesinti satırı OLMADAN kalemler başlıktaki tutara toplanmıyordu:
                cayma iadesinde ürün 800 görünüp toplam 680 yazıyor, aradaki
                −120 (alıcıdan kesilen dönüş kargosu) ekranda yoktu. */}
            {Number(rr.returnShippingChargeToBuyer ?? 0) > 0 && (
              <Field
                label={t("admin.operations.refundRequests.returnChargeBuyer")}
              >
                <span className="text-danger-700">
                  −{fmtTry(rr.returnShippingChargeToBuyer ?? 0)}
                </span>
              </Field>
            )}
            <Field
              label={t("admin.operations.refundRequests.buyerRefundTotal")}
            >
              <span className="font-semibold text-heading">
                {fmtTry(rr.amount)}
              </span>
            </Field>
          </div>

          {/* Satıcı bacağı: alıcı iadesine girmeyen ama satıcının payout/escrow'una
              işlenen kalemler — komisyon iadesi/tutulan bedel + kargo borç/tazminleri. */}
          <div className="rounded-lg bg-surface-alt p-3">
            <p className="mb-2 text-xs font-medium text-muted">
              {t("admin.operations.refundRequests.sellerImpactTitle")} —{" "}
              {t("admin.operations.refundRequests.sellerImpactHint")}
            </p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
              <Field
                label={t("admin.operations.refundRequests.sellerFeeRefund")}
              >
                {fmtTry(rr.refundedSellerFeeAmount ?? 0)}
              </Field>
              <Field
                label={t("admin.operations.refundRequests.sellerFeeRetained")}
              >
                {fmtTry(rr.retainedSellerPlatformFeeAmount ?? 0)}
              </Field>
              {Number(rr.returnShippingChargeToSeller ?? 0) > 0 && (
                <Field
                  label={t(
                    "admin.operations.refundRequests.chargeReturnToSeller",
                  )}
                >
                  <span className="text-danger-700">
                    −{fmtTry(rr.returnShippingChargeToSeller ?? 0)}
                  </span>
                </Field>
              )}
              {Number(rr.outboundShippingChargeToSeller ?? 0) > 0 && (
                <Field
                  label={t(
                    "admin.operations.refundRequests.chargeOutboundToSeller",
                  )}
                >
                  <span className="text-danger-700">
                    −{fmtTry(rr.outboundShippingChargeToSeller ?? 0)}
                  </span>
                </Field>
              )}
              {Number(rr.sellerShippingCompensationAmount ?? 0) > 0 && (
                <Field
                  label={t(
                    "admin.operations.refundRequests.sellerShippingCompensation",
                  )}
                >
                  <span className="text-success-700">
                    +{fmtTry(rr.sellerShippingCompensationAmount ?? 0)}
                  </span>
                </Field>
              )}
            </div>
          </div>
        </>
      )}

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
                config={statusConfig(shipmentStatusConfig, t)}
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
