"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Select } from "@tarodan/ui";
import {
  buildOrderBreakdown,
  type OrderBreakdownLineKey,
} from "@tarodan/shared";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { extractList } from "@/lib/extract";
import { fmtTry } from "@/lib/format";
import { adminKeys } from "@/lib/query/keys";
import { readPspFeeRate, readSetting } from "@/lib/settings";
import {
  sellerTypeLabel,
  type CommissionRulePreview,
  type PackageTierCode,
} from "../_lib/types";

interface ShippingTariffSummary {
  id: string;
  name: string;
  version: number;
  status: "draft" | "active" | "archived";
  packageTiers?: Array<{
    code: PackageTierCode;
    label: string;
    amount: number | string;
  }>;
}

const LINE_LABEL = {
  buyerCommission: "admin.finance.commission.buyerCommission",
  buyerShipping: "admin.finance.commission.buyerShipping",
  buyerServiceFee: "admin.finance.commission.buyerServiceFee",
  sellerCommission: "admin.finance.commission.sellerCommission",
  sellerShipping: "admin.finance.commission.sellerShipping",
  sellerPlatformFee: "admin.finance.commission.sellerPlatformFee",
} as const satisfies Record<OrderBreakdownLineKey, string>;

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const deduction = (value: number) => (value === 0 ? 0 : -value);

const booleanSetting = (value: string | undefined, fallback: boolean) => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const rateSetting = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

function BreakdownRow({
  label,
  value,
  vat,
  tone,
}: {
  label: ReactNode;
  value: number;
  vat?: number;
  tone?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 py-1 text-sm">
      <span className="min-w-0 text-muted">{label}</span>
      <span className={`tabular-nums ${tone ?? "text-heading"}`}>
        {fmtTry(value)}
      </span>
      <span className="w-24 text-right text-xs tabular-nums text-muted">
        {vat == null ? "" : fmtTry(vat)}
      </span>
    </div>
  );
}

function BreakdownTotal({
  label,
  value,
  tone,
  strong = false,
}: {
  label: string;
  value: number;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 border-t border-border pt-2 text-sm ${
        strong ? "font-semibold" : ""
      }`}
    >
      <span className="text-heading">{label}</span>
      <span className={`tabular-nums ${tone ?? "text-heading"}`}>
        {fmtTry(value)}
      </span>
      <span className="w-24" />
    </div>
  );
}

function BreakdownHeader({
  title,
  amount,
  vat,
}: {
  title: string;
  amount: string;
  vat: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 text-xs font-medium uppercase tracking-wide text-muted">
      <span>{title}</span>
      <span className="text-right">{amount}</span>
      <span className="w-24 text-right">{vat}</span>
    </div>
  );
}

/** Keeps the buyer/seller ledgers row-aligned when a line belongs to one side. */
function BreakdownEmptyRow() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 py-1 text-sm"
    >
      <span>&nbsp;</span>
      <span>&nbsp;</span>
      <span className="w-24">&nbsp;</span>
    </div>
  );
}

export function RuleResolutionPreview({
  preview,
  categoryName,
}: {
  preview: CommissionRulePreview;
  categoryName: string;
}) {
  const t = useTranslations();
  const [tierCode, setTierCode] = useState<PackageTierCode>("small");
  const tierLabels: Record<PackageTierCode, string> = {
    small: t("admin.finance.commission.tierSmall"),
    medium: t("admin.finance.commission.tierMedium"),
    large: t("admin.finance.commission.tierLarge"),
  };

  const tariffsQuery = useQuery({
    queryKey: adminKeys.all("shipping-tariffs"),
    queryFn: async () =>
      extractList<ShippingTariffSummary>(
        (await adminApi.getShippingTariffs()).data,
      ),
  });
  const settingsQuery = useQuery({
    queryKey: adminKeys.all("platform-settings"),
    queryFn: async () => {
      const response = await adminApi.getSettings();
      return response.data?.data ?? response.data ?? [];
    },
  });

  const activeTariff = tariffsQuery.data?.find(
    (tariff) => tariff.status === "active",
  );
  const tiers = activeTariff?.packageTiers ?? [];
  const selectedTier = tiers.find((tier) => tier.code === tierCode) ?? tiers[0];
  const selectedTierCode = selectedTier?.code ?? tierCode;
  const shippingAmount = selectedTier ? Number(selectedTier.amount) : 0;
  const shippingBuyerShare = Math.min(
    100,
    Math.max(0, Number(preview.shippingBuyerShares[selectedTierCode] ?? 100)),
  );
  const buyerShippingAmount = round2(
    shippingAmount * (shippingBuyerShare / 100),
  );
  const sellerShippingAmount = round2(shippingAmount - buyerShippingAmount);

  const settings = settingsQuery.data;
  const serviceVatEnabled = booleanSetting(
    readSetting(settings, "service_vat_enabled"),
    true,
  );
  const configuredServiceVatRate = rateSetting(
    readSetting(settings, "service_vat_rate"),
    20,
  );
  const serviceVatRate = serviceVatEnabled ? configuredServiceVatRate : 0;
  const configuredWithholdingRate = rateSetting(
    readSetting(settings, "withholding_tax_rate"),
    1,
  );
  const withholdingAppliesToIndividual = booleanSetting(
    readSetting(settings, "withholding_applies_to_individual"),
    false,
  );
  const withholdingRate =
    preview.matchedSellerType === "BUSINESS" || withholdingAppliesToIndividual
      ? configuredWithholdingRate
      : 0;
  const withholdingTaxAmount = round2(
    preview.calculationAmount * (withholdingRate / 100),
  );
  const pspFeeRate = readPspFeeRate(settings);

  const breakdown = buildOrderBreakdown({
    subtotal: preview.calculationAmount,
    sellerCommissionAmount: preview.sellerCommissionAmount,
    sellerPlatformFeeAmount: preview.sellerPlatformFeeAmount,
    sellerShippingAmount,
    buyerCommissionAmount: preview.buyerCommissionAmount,
    buyerServiceFeeAmount: preview.buyerServiceFeeAmount,
    buyerShippingAmount,
    withholdingTaxAmount,
    serviceVatRate,
    pspFeeRate,
  });

  return (
    <div className="space-y-4 rounded-xl border border-success-200 bg-success-50/40 p-4">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-success-900">{preview.ruleName}</h3>
          <Badge variant="success">
            {t("admin.finance.commission.singleRuleMatched")}
          </Badge>
        </div>
        <p className="text-sm text-success-800">
          {categoryName} · {sellerTypeLabel(preview.matchedSellerType, t)} ·{" "}
          {fmtTry(preview.calculationAmount)}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(14rem,22rem)_1fr] md:items-end">
          <Select
            label={t("admin.finance.commission.examplePackageTier")}
            value={selectedTier?.code ?? ""}
            onChange={(event) =>
              setTierCode(event.target.value as PackageTierCode)
            }
            disabled={tariffsQuery.isLoading || tiers.length === 0}
            options={tiers.map((tier) => ({
              value: tier.code,
              label: `${tier.label} — ${fmtTry(Number(tier.amount))}`,
            }))}
            placeholder={t("admin.finance.commission.noActiveShippingTariff")}
          />
          <div className="space-y-1 text-sm text-muted">
            {activeTariff ? (
              <p>
                {t("admin.finance.commission.activeShippingTariff", {
                  name: activeTariff.name,
                  version: activeTariff.version,
                  amount: fmtTry(shippingAmount),
                })}
              </p>
            ) : (
              <p>{t("admin.finance.commission.noActiveShippingTariff")}</p>
            )}
            <p>
              {t("admin.finance.commission.previewCurrentSettings", {
                vat: serviceVatRate,
                withholding: withholdingRate,
                psp: pspFeeRate,
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <BreakdownHeader
            title={t("admin.finance.commission.buyerSide")}
            amount={t("admin.finance.commission.lineAmount")}
            vat={t("admin.finance.commission.lineVat")}
          />
          <BreakdownRow
            label={t("admin.finance.commission.productPrice")}
            value={breakdown.subtotal}
          />
          {breakdown.buyer.lines.map((line) => (
            <BreakdownRow
              key={line.key}
              label={t(LINE_LABEL[line.key])}
              value={line.amount}
              vat={line.vat}
            />
          ))}
          <BreakdownEmptyRow />
          <BreakdownTotal
            label={t("admin.finance.commission.buyerVatTotal")}
            value={breakdown.buyer.vatTotal}
          />
          <BreakdownTotal
            label={t("admin.finance.commission.buyerAddedTotal")}
            value={breakdown.buyer.addedTotal}
          />
          <BreakdownTotal
            label={t("admin.finance.commission.buyerPays")}
            value={breakdown.buyer.payable}
            tone="text-primary-700"
            strong
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <BreakdownHeader
            title={t("admin.finance.commission.sellerSide")}
            amount={t("admin.finance.commission.lineAmount")}
            vat={t("admin.finance.commission.lineVat")}
          />
          <BreakdownRow
            label={t("admin.finance.commission.productPrice")}
            value={breakdown.subtotal}
          />
          {breakdown.seller.lines.map((line) => (
            <BreakdownRow
              key={line.key}
              label={t(LINE_LABEL[line.key])}
              value={line.amount}
              vat={line.vat}
            />
          ))}
          <BreakdownRow
            label={t("admin.finance.commission.withholding")}
            value={breakdown.seller.withholding}
          />
          <BreakdownTotal
            label={t("admin.finance.commission.sellerVatTotal")}
            value={breakdown.seller.vatTotal}
          />
          <BreakdownTotal
            label={t("admin.finance.commission.sellerDeductionTotal")}
            value={breakdown.seller.deductionTotal}
          />
          <BreakdownTotal
            label={t("admin.finance.commission.sellerReceives")}
            value={breakdown.seller.net}
            tone="text-success-700"
            strong
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h4 className="mb-3 font-medium text-heading">
          {t("admin.finance.commission.platformSplitTitle")}
        </h4>
        <div className="space-y-1.5 rounded-lg bg-surface-alt p-4">
          <BreakdownRow
            label={t("admin.finance.commission.grossRetained")}
            value={breakdown.platform.grossRetained}
            tone="font-medium text-heading"
          />
          <BreakdownRow
            label={t("admin.finance.commission.platformShipping")}
            value={deduction(breakdown.platform.shipping)}
          />
          <BreakdownRow
            label={t("admin.finance.commission.afterShipping")}
            value={breakdown.platform.afterShipping}
          />
          <BreakdownRow
            label={t("admin.finance.commission.withholding")}
            value={deduction(breakdown.seller.withholding)}
          />
          <BreakdownRow
            label={t("admin.finance.commission.afterWithholding")}
            value={breakdown.platform.afterWithholding}
          />
          <BreakdownRow
            label={t("admin.finance.commission.serviceVatOut")}
            value={deduction(breakdown.platform.vatOut)}
          />
          <BreakdownRow
            label={t("admin.finance.commission.afterVat")}
            value={breakdown.platform.afterVat}
          />
          <BreakdownRow
            label={t("admin.finance.commission.pspFee")}
            value={deduction(breakdown.platform.pspFee)}
          />
          <BreakdownTotal
            label={t("admin.finance.commission.netRevenue")}
            value={breakdown.platform.netRevenue}
            tone="text-primary-700"
            strong
          />
          <div className="flex justify-between gap-4 text-xs text-muted">
            <span>{t("admin.finance.commission.netTakeRate")}</span>
            <span className="tabular-nums">
              %{breakdown.platform.netTakeRate}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h4 className="mb-3 font-medium text-heading">
          {t("admin.finance.commission.shippingSharePreview")}
        </h4>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["small", "medium", "large"] as PackageTierCode[]).map((code) => {
            const buyer = Number(preview.shippingBuyerShares[code] ?? 0);
            return (
              <div key={code} className="rounded-lg bg-surface-alt p-3">
                <p className="text-xs font-medium text-muted">
                  {tierLabels[code]}
                </p>
                <p className="mt-1 text-sm font-semibold text-heading">
                  {t("admin.finance.commission.buyerSellerShare", {
                    buyer,
                    seller: 100 - buyer,
                  })}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-xs">
        <div className="min-w-0">
          <span className="text-muted">
            {t("admin.finance.commission.ruleId")}:{" "}
          </span>
          <span className="break-all font-mono text-heading">
            {preview.ruleId}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-muted">
            {t("admin.finance.commission.ruleSetId")}:{" "}
          </span>
          <span className="break-all font-mono text-heading">
            {preview.ruleSetId}
          </span>
        </div>
      </div>
    </div>
  );
}
