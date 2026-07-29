"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Input, Select } from "@tarodan/ui";
import {
  FormModal,
  FormError,
  FormInput,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { extractErrorMessage } from "@/lib/error";
import { fmtTry } from "@/lib/format";
import {
  type CommissionRule,
  type CommissionFormValues,
  commissionSchema,
  emptyCommissionForm,
  ruleToForm,
  commissionFormToPayload,
  sellerTypes,
  taxpayerTypes,
  appliesToOptions,
} from "../_lib/types";

interface ShippingTariffSummary {
  id: string;
  name: string;
  provider: string;
  version: number;
  status: "draft" | "active" | "archived";
  outboundPackageFee: number | string;
  rates?: Array<{ desi: number; amount: number | string }>;
}

/** rate% of amount, clamped by optional [min,max] TL. */
function feeFor(
  amount: number,
  rate: string,
  min: string,
  max: string,
): number {
  const r = parseFloat(rate);
  if (!r || Number.isNaN(r)) return 0;
  let val = amount * (r / 100);
  const lo = parseFloat(min);
  const hi = parseFloat(max);
  if (!Number.isNaN(lo) && val < lo) val = lo;
  if (!Number.isNaN(hi) && val > hi) val = hi;
  return Math.round(val * 100) / 100;
}

/** Reusable rate + TL floor/cap block. */
function RateBlock({
  title,
  rateName,
  minName,
  maxName,
}: {
  title: string;
  rateName: string;
  minName: string;
  maxName: string;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-heading">{title}</h3>
      <div className="grid grid-cols-3 gap-3">
        <FormInput
          name={rateName}
          label={t("admin.finance.commission.ratePercent")}
          type="number"
          step="0.01"
          min="0"
        />
        <FormInput
          name={minName}
          label={t("admin.finance.commission.minTl")}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("common.optional")}
        />
        <FormInput
          name={maxName}
          label={t("admin.finance.commission.maxTl")}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("common.optional")}
        />
      </div>
    </div>
  );
}

/** Live client-side breakdown for an example order — commission + shipping split + VAT/stopaj. */
function BreakdownPreview() {
  const t = useTranslations();
  const { watch } = useFormContext<CommissionFormValues>();
  const v = watch();
  const [price, setPrice] = useState("1000");
  const [shippingDesi, setShippingDesi] = useState("1");
  const [vat, setVat] = useState("20");
  const [withholding, setWithholding] = useState("1");
  const tariffsQuery = useQuery({
    queryKey: adminKeys.all("shipping-tariffs"),
    queryFn: async () =>
      extractList<ShippingTariffSummary>(
        (await adminApi.getShippingTariffs()).data,
      ),
  });
  const activeTariff = tariffsQuery.data?.find(
    (tariff) => tariff.status === "active",
  );
  const rates = [...(activeTariff?.rates ?? [])].sort(
    (left, right) => left.desi - right.desi,
  );
  const selectedRate =
    rates.find((rate) => rate.desi === Number(shippingDesi)) ?? rates[0];

  const amount = parseFloat(price) || 0;
  const shipping = selectedRate
    ? Number(selectedRate.amount)
    : Number(activeTariff?.outboundPackageFee ?? 0);
  const vatRate = parseFloat(vat) || 0;
  const whRate = parseFloat(withholding) || 0;

  const buyerCommission = feeFor(
    amount,
    v.buyerCommissionRate,
    v.buyerCommissionMin,
    v.buyerCommissionMax,
  );
  const buyerServiceFee = feeFor(
    amount,
    v.buyerServiceFeeRate,
    v.buyerServiceFeeMin,
    v.buyerServiceFeeMax,
  );
  const sellerCommission = feeFor(
    amount,
    v.sellerCommissionRate,
    v.sellerCommissionMin,
    v.sellerCommissionMax,
  );
  const sellerPlatformFee = feeFor(
    amount,
    v.sellerPlatformFeeRate,
    v.sellerPlatformFeeMin,
    v.sellerPlatformFeeMax,
  );
  const buyerShare = Math.min(
    100,
    Math.max(0, parseFloat(v.shippingBuyerShare) || 0),
  );
  const buyerShipping = Math.round(shipping * (buyerShare / 100) * 100) / 100;
  const sellerShipping = Math.round((shipping - buyerShipping) * 100) / 100;
  const isCorporate = v.taxpayerType === "corporate";
  // KDV = sale VAT (corporate only); stopaj = withholding (corporate only); komisyon KDV on the seller fees.
  const saleVat = isCorporate
    ? Math.round(amount * (vatRate / 100) * 100) / 100
    : 0;
  const stopaj = isCorporate
    ? Math.round(amount * (whRate / 100) * 100) / 100
    : 0;
  const commissionVat =
    Math.round((sellerCommission + sellerPlatformFee) * (vatRate / 100) * 100) /
    100;

  const buyerPays =
    amount + buyerCommission + buyerServiceFee + buyerShipping + saleVat;
  const sellerReceives =
    amount +
    saleVat -
    sellerCommission -
    sellerPlatformFee -
    sellerShipping -
    stopaj;

  const Row = ({
    label,
    value,
    tone,
  }: {
    label: string;
    value: number;
    tone?: string;
  }) => (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={tone ?? "text-heading"}>{fmtTry(value)}</span>
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-muted">
        {t("admin.finance.commission.previewCalculator")}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input
          type="number"
          min="0"
          step="0.01"
          label={t("admin.finance.commission.examplePrice")}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Select
          label={t("admin.finance.commission.exampleShippingDesi")}
          value={selectedRate ? String(selectedRate.desi) : ""}
          onChange={(event) => setShippingDesi(event.target.value)}
          disabled={tariffsQuery.isLoading || rates.length === 0}
          options={rates.map((rate) => ({
            value: String(rate.desi),
            label: t("admin.finance.commission.shippingDesiAmount", {
              desi: rate.desi,
              amount: fmtTry(Number(rate.amount)),
            }),
          }))}
          placeholder={t("admin.finance.commission.noActiveShippingTariff")}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          label={t("admin.finance.commission.exampleVat")}
          value={vat}
          onChange={(e) => setVat(e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          label={t("admin.finance.commission.exampleWithholding")}
          value={withholding}
          onChange={(e) => setWithholding(e.target.value)}
        />
      </div>
      {activeTariff && (
        <p className="text-xs text-muted">
          {t("admin.finance.commission.activeShippingTariff", {
            name: activeTariff.name,
            version: activeTariff.version,
            amount: fmtTry(shipping),
          })}
        </p>
      )}
      {!isCorporate && (
        <p className="text-xs text-muted">
          {t("admin.finance.commission.corporateOnlyNote")}
        </p>
      )}
      <div className="space-y-1.5 rounded-lg bg-surface-alt p-4 text-sm">
        <Row
          label={t("admin.finance.commission.buyerCommission")}
          value={buyerCommission}
        />
        <Row
          label={t("admin.finance.commission.buyerServiceFee")}
          value={buyerServiceFee}
        />
        <Row
          label={t("admin.finance.commission.buyerShipping")}
          value={buyerShipping}
        />
        {saleVat > 0 && (
          <Row label={t("admin.finance.commission.vat")} value={saleVat} />
        )}
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
          <span>{t("admin.finance.commission.buyerPays")}</span>
          <span className="text-primary-700">{fmtTry(buyerPays)}</span>
        </div>
        <div className="pt-2" />
        <Row
          label={t("admin.finance.commission.sellerCommission")}
          value={sellerCommission}
        />
        <Row
          label={t("admin.finance.commission.sellerPlatformFee")}
          value={sellerPlatformFee}
        />
        <Row
          label={t("admin.finance.commission.sellerShipping")}
          value={sellerShipping}
        />
        <Row
          label={t("admin.finance.commission.commissionVat")}
          value={commissionVat}
        />
        {stopaj > 0 && (
          <Row
            label={t("admin.finance.commission.withholding")}
            value={stopaj}
          />
        )}
        <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
          <span>{t("admin.finance.commission.sellerReceives")}</span>
          <span className="text-success-700">{fmtTry(sellerReceives)}</span>
        </div>
      </div>
      <p className="text-xs text-muted">
        {t("admin.finance.commission.previewTaxNote")}
      </p>
    </div>
  );
}

/** Create/edit commission rule. Mount with `key={rule?.id ?? 'new'}` so defaults seed fresh. */
export function CommissionRuleFormModal({
  open,
  onClose,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  rule?: CommissionRule;
}) {
  const t = useTranslations();
  const isEdit = Boolean(rule);
  const form = useZodForm(commissionSchema(t), {
    defaultValues: rule ? ruleToForm(rule) : emptyCommissionForm,
  });

  const { data: categories = [] } = useCategories();

  const save = useAdminMutation(
    (v: CommissionFormValues) =>
      isEdit
        ? adminApi.updateCommissionRule(rule!.id, commissionFormToPayload(v))
        : adminApi.createCommissionRule(commissionFormToPayload(v)),
    {
      invalidates: ["commission-rules"],
      successMessage: isEdit
        ? t("admin.finance.commission.ruleUpdated")
        : t("admin.finance.commission.ruleCreated"),
      showErrorToast: false,
      onSuccess: onClose,
    },
  );

  const categoryOptions = [
    { value: "", label: t("admin.finance.commission.allCategories") },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const submit = (values: CommissionFormValues) => {
    form.clearErrors("root");
    save.mutate(values, {
      onError: (error) => {
        form.setError("root", {
          type: "server",
          message: extractErrorMessage(
            error,
            t("admin.finance.commission.saveFailed"),
          ),
        });
      },
    });
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.finance.commission.editRule")
          : t("admin.finance.commission.newRule")
      }
      form={form}
      onSubmit={submit}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
      maxWidth="max-w-2xl"
    >
      <FormError />
      <FormInput name="name" label={t("admin.finance.commission.ruleName")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormSelect
          name="categoryId"
          label={t("common.category")}
          options={categoryOptions}
        />
        <FormSelect
          name="sellerType"
          label={t("admin.finance.commission.sellerType")}
          options={sellerTypes(t)}
        />
        <FormSelect
          name="taxpayerType"
          label={t("admin.finance.commission.taxpayerType")}
          options={taxpayerTypes(t)}
        />
      </div>

      {/* Kademeli eşleşme: ürün/satır tutar aralığı */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormInput
          name="minAmount"
          label={t("admin.finance.commission.minAmountLabel")}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("common.optional")}
        />
        <FormInput
          name="maxAmount"
          label={t("admin.finance.commission.maxAmountLabel")}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("common.optional")}
        />
        <FormSelect
          name="appliesTo"
          label={t("admin.finance.commission.appliesTo")}
          options={appliesToOptions(t)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RateBlock
          title={t("admin.finance.commission.sellerCommission")}
          rateName="sellerCommissionRate"
          minName="sellerCommissionMin"
          maxName="sellerCommissionMax"
        />
        <RateBlock
          title={t("admin.finance.commission.sellerPlatformFee")}
          rateName="sellerPlatformFeeRate"
          minName="sellerPlatformFeeMin"
          maxName="sellerPlatformFeeMax"
        />
        <RateBlock
          title={t("admin.finance.commission.buyerServiceFee")}
          rateName="buyerServiceFeeRate"
          minName="buyerServiceFeeMin"
          maxName="buyerServiceFeeMax"
        />
        <RateBlock
          title={t("admin.finance.commission.buyerCommission")}
          rateName="buyerCommissionRate"
          minName="buyerCommissionMin"
          maxName="buyerCommissionMax"
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <FormInput
          name="shippingBuyerShare"
          label={t("admin.finance.commission.shippingBuyerShareLabel")}
          type="number"
          step="1"
          min="0"
          max="100"
          helperText={t("admin.finance.commission.shippingShareHelper")}
        />
      </div>

      <BreakdownPreview />
      <FormCheckbox
        name="isActive"
        label={t("admin.finance.commission.ruleActive")}
      />
    </FormModal>
  );
}
