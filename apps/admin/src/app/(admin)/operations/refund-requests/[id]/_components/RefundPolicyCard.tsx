"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Label, Radio } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { extractErrorMessage } from "@/lib/error";
import { fmtTry } from "@/lib/format";

/**
 * Phase 4B.2 — Admin RefundRequest policy override card.
 * 4 booleans + returnShippingPayer radio + live partial refund amount.
 */
export type ReturnShippingPayer = "buyer" | "seller" | "platform";

export interface RefundPolicyCardProps {
  initial: {
    refundProductAmount: boolean;
    refundShippingFee: boolean;
    refundBuyerFee: boolean;
    refundSellerCommission: boolean;
    returnShippingPayer: ReturnShippingPayer | null;
  };
  order: {
    totalAmount: number;
    shippingCost: number;
    buyerFeeAmount: number;
    commissionAmount: number;
  };
  onSavePolicy: (payload: {
    refundProductAmount?: boolean;
    refundShippingFee?: boolean;
    refundBuyerFee?: boolean;
    refundSellerCommission?: boolean;
  }) => Promise<void>;
  onSavePayer: (payer: ReturnShippingPayer) => Promise<void>;
  disabled?: boolean;
}

export function RefundPolicyCard({
  initial,
  order,
  onSavePolicy,
  onSavePayer,
  disabled,
}: RefundPolicyCardProps) {
  const t = useTranslations();
  const [refundProductAmount, setRefundProductAmount] = useState(
    initial.refundProductAmount,
  );
  const [refundShippingFee, setRefundShippingFee] = useState(
    initial.refundShippingFee,
  );
  const [refundBuyerFee, setRefundBuyerFee] = useState(initial.refundBuyerFee);
  const [refundSellerCommission, setRefundSellerCommission] = useState(
    initial.refundSellerCommission,
  );
  const [returnShippingPayer, setReturnShippingPayerState] =
    useState<ReturnShippingPayer | null>(initial.returnShippingPayer);

  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingPayer, setSavingPayer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirtyPolicy =
    refundProductAmount !== initial.refundProductAmount ||
    refundShippingFee !== initial.refundShippingFee ||
    refundBuyerFee !== initial.refundBuyerFee ||
    refundSellerCommission !== initial.refundSellerCommission;

  const dirtyPayer = returnShippingPayer !== initial.returnShippingPayer;

  // Ürün kalemi BACKEND ile AYNI formülden (computePartialRefundAmount):
  // total − kargo − alıcı ücreti = alıcının ürüne FİİLEN ödediği. `subtotal`
  // kullanılmaz — çoğu kayıtta NULL ve indirim ÖNCESİ fiyatı tuttuğu için
  // kartta olduğundan yüksek (ya da ₺0) bir önizleme gösteriyordu; admin'in
  // onayladığı sayı backend'in iade ettiğinden sapabiliyordu.
  const productPaid = Math.max(
    0,
    Number(order.totalAmount) -
      Number(order.shippingCost) -
      Number(order.buyerFeeAmount),
  );

  const refundAmount = useMemo(() => {
    let total = 0;
    if (refundProductAmount) total += productPaid;
    if (refundShippingFee) total += Number(order.shippingCost);
    if (refundBuyerFee) total += Number(order.buyerFeeAmount);
    // refundSellerCommission is a seller charge — not added to the buyer's refund amount
    return total;
  }, [
    refundProductAmount,
    refundShippingFee,
    refundBuyerFee,
    productPaid,
    order.shippingCost,
    order.buyerFeeAmount,
  ]);

  const handleSavePolicy = async () => {
    setError(null);
    setSavingPolicy(true);
    try {
      await onSavePolicy({
        refundProductAmount,
        refundShippingFee,
        refundBuyerFee,
        refundSellerCommission,
      });
    } catch (error) {
      setError(
        extractErrorMessage(error, t("admin.operations.common.errorOccurred")),
      );
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSavePayer = async () => {
    if (!returnShippingPayer) return;
    setError(null);
    setSavingPayer(true);
    try {
      await onSavePayer(returnShippingPayer);
    } catch (error) {
      setError(
        extractErrorMessage(error, t("admin.operations.common.errorOccurred")),
      );
    } finally {
      setSavingPayer(false);
    }
  };

  return (
    <SectionCard
      title={t("admin.operations.refundRequests.policyTitle")}
      bodyClassName="space-y-6"
    >
      {/* 4 booleans */}
      <div className="space-y-2">
        <PolicyRow
          label={t("admin.operations.refundRequests.policy.productAmount", {
            amount: fmtTry(productPaid),
          })}
          checked={refundProductAmount}
          onChange={setRefundProductAmount}
          disabled={disabled || savingPolicy}
        />
        <PolicyRow
          label={t("admin.operations.refundRequests.policy.shippingFee", {
            amount: fmtTry(Number(order.shippingCost)),
          })}
          checked={refundShippingFee}
          onChange={setRefundShippingFee}
          disabled={disabled || savingPolicy}
        />
        <PolicyRow
          label={t("admin.operations.refundRequests.policy.buyerFee", {
            amount: fmtTry(Number(order.buyerFeeAmount)),
          })}
          checked={refundBuyerFee}
          onChange={setRefundBuyerFee}
          disabled={disabled || savingPolicy}
        />
        <PolicyRow
          label={t("admin.operations.refundRequests.policy.sellerCommission", {
            amount: fmtTry(Number(order.commissionAmount)),
          })}
          checked={refundSellerCommission}
          onChange={setRefundSellerCommission}
          disabled={disabled || savingPolicy}
        />
      </div>

      <div className="rounded-md bg-info-50 p-3 text-sm">
        <div className="text-muted">
          {t("admin.operations.refundRequests.policy.refundAmountLabel")}
        </div>
        <div className="text-2xl font-bold text-info-700">
          {fmtTry(refundAmount)}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSavePolicy}
          disabled={!dirtyPolicy || savingPolicy || disabled}
        >
          {savingPolicy
            ? t("admin.operations.common.saving")
            : t("admin.operations.refundRequests.policy.saveButton")}
        </Button>
      </div>

      {/* Shipping payer */}
      <div className="space-y-2 border-t pt-4">
        <Label>{t("admin.operations.refundRequests.payerQuestion")}</Label>
        <div className="flex flex-col gap-2">
          <PayerRadio
            value="buyer"
            current={returnShippingPayer}
            onChange={setReturnShippingPayerState}
            label={t("admin.operations.common.buyer")}
            helper={t("admin.operations.refundRequests.payerRadio.buyerHelper")}
            disabled={disabled || savingPayer}
          />
          <PayerRadio
            value="seller"
            current={returnShippingPayer}
            onChange={setReturnShippingPayerState}
            label={t("admin.operations.common.seller")}
            helper={t(
              "admin.operations.refundRequests.payerRadio.sellerHelper",
            )}
            disabled={disabled || savingPayer}
          />
          <PayerRadio
            value="platform"
            current={returnShippingPayer}
            onChange={setReturnShippingPayerState}
            label={t("admin.operations.refundRequests.payerRadio.platform")}
            helper={t(
              "admin.operations.refundRequests.payerRadio.platformHelper",
            )}
            disabled={disabled || savingPayer}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={handleSavePayer}
            disabled={
              !dirtyPayer || !returnShippingPayer || savingPayer || disabled
            }
          >
            {savingPayer
              ? t("admin.operations.common.saving")
              : t("admin.operations.refundRequests.payerSaveButton")}
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-danger-600">{error}</div>}
    </SectionCard>
  );
}

function PolicyRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function PayerRadio({
  value,
  current,
  onChange,
  label,
  helper,
  disabled,
}: {
  value: ReturnShippingPayer;
  current: ReturnShippingPayer | null;
  onChange: (v: ReturnShippingPayer) => void;
  label: string;
  helper?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <Radio
        name="returnShippingPayer"
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {helper && <span className="text-muted"> — {helper}</span>}
      </span>
    </label>
  );
}
