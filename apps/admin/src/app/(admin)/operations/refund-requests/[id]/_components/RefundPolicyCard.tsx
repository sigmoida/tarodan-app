"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Checkbox,
  Label,
  Radio,
} from "@tarodan/ui";

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
    subtotal: number | null;
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

function fmt(n: number): string {
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

export function RefundPolicyCard({
  initial,
  order,
  onSavePolicy,
  onSavePayer,
  disabled,
}: RefundPolicyCardProps) {
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

  const refundAmount = useMemo(() => {
    let total = 0;
    if (refundProductAmount && order.subtotal != null)
      total += Number(order.subtotal);
    if (refundShippingFee) total += Number(order.shippingCost);
    if (refundBuyerFee) total += Number(order.buyerFeeAmount);
    // refundSellerCommission is a seller charge — not added to the buyer's refund amount
    return total;
  }, [
    refundProductAmount,
    refundShippingFee,
    refundBuyerFee,
    order.subtotal,
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
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Hata oluştu");
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
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Hata oluştu");
    } finally {
      setSavingPayer(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>İade Politikası</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 4 booleans */}
        <div className="space-y-2">
          <PolicyRow
            label={`Ürün bedeli iade (${fmt(Number(order.subtotal ?? 0))})`}
            checked={refundProductAmount}
            onChange={setRefundProductAmount}
            disabled={disabled || savingPolicy}
          />
          <PolicyRow
            label={`Kargo bedeli iade (${fmt(Number(order.shippingCost))})`}
            checked={refundShippingFee}
            onChange={setRefundShippingFee}
            disabled={disabled || savingPolicy}
          />
          <PolicyRow
            label={`Platform hizmet bedeli (%3) iade (${fmt(Number(order.buyerFeeAmount))})`}
            checked={refundBuyerFee}
            onChange={setRefundBuyerFee}
            disabled={disabled || savingPolicy}
          />
          <PolicyRow
            label={`Satıcı komisyonu iade (${fmt(Number(order.commissionAmount))})`}
            checked={refundSellerCommission}
            onChange={setRefundSellerCommission}
            disabled={disabled || savingPolicy}
          />
        </div>

        <div className="rounded-md bg-info-50 p-3 text-sm">
          <div className="text-muted">Alıcıya iade edilecek tutar</div>
          <div className="text-2xl font-bold text-info-700">
            {fmt(refundAmount)}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSavePolicy}
            disabled={!dirtyPolicy || savingPolicy || disabled}
          >
            {savingPolicy ? "Kaydediliyor..." : "Politikayı Kaydet"}
          </Button>
        </div>

        {/* Shipping payer */}
        <div className="space-y-2 border-t pt-4">
          <Label>İade kargosunu kim öder?</Label>
          <div className="flex flex-col gap-2">
            <PayerRadio
              value="buyer"
              current={returnShippingPayer}
              onChange={setReturnShippingPayerState}
              label="Alıcı"
              helper="Vazgeçme / keyfi iade durumunda"
              disabled={disabled || savingPayer}
            />
            <PayerRadio
              value="seller"
              current={returnShippingPayer}
              onChange={setReturnShippingPayerState}
              label="Satıcı"
              helper="Haklı iade (hatalı, eksik ya da yanlış ürün)"
              disabled={disabled || savingPayer}
            />
            <PayerRadio
              value="platform"
              current={returnShippingPayer}
              onChange={setReturnShippingPayerState}
              label="Platform"
              helper="Kargo kaybı veya istisnai durum"
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
              {savingPayer ? "Kaydediliyor..." : "Tarafı Kaydet"}
            </Button>
          </div>
        </div>

        {error && <div className="text-sm text-danger-600">{error}</div>}
      </CardContent>
    </Card>
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
