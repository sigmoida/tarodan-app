"use client";

import { Badge, Modal } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { DataList, Field } from "@/components/detail/DataList";
import { fmtTry } from "@/lib/format";
import {
  inclusiveCommissionMaximum,
  sellerTypeLabel,
  type CommissionRule,
} from "../_lib/types";

const percent = (value: number) => `%${value.toFixed(2)}`;
const optionalMoney = (value: number | null) =>
  value == null ? "—" : fmtTry(value);

export function CommissionRuleDetailModal({
  rule,
  historical = false,
  onClose,
}: {
  rule: CommissionRule;
  historical?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const set = rule.ruleSet;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t(
        historical
          ? "admin.finance.commission.historicalRuleTitle"
          : "admin.finance.commission.readonlyRuleTitle",
      )}
      description={t(
        historical
          ? "admin.finance.commission.historicalRuleDescription"
          : "admin.finance.commission.readonlyRuleDescription",
      )}
      size="2xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-4">
          <div>
            <p className="font-semibold text-heading">{rule.name}</p>
            <p className="mt-1 break-all font-mono text-xs text-muted">
              {rule.id}
            </p>
          </div>
          <Badge variant={set?.status === "DRAFT" ? "warning" : "success"}>
            {set ? `${set.name} · v${set.version} · ${set.status}` : "—"}
          </Badge>
        </div>

        <DataList>
          <Field label={t("common.category")}>{rule.categoryName}</Field>
          <Field label={t("admin.finance.commission.sellerType")}>
            {sellerTypeLabel(rule.sellerType, t)}
          </Field>
          <Field label={t("admin.finance.commission.minAmountLabel")}>
            {fmtTry(rule.minAmount)}
          </Field>
          <Field label={t("admin.finance.commission.maxAmountLabel")}>
            {optionalMoney(inclusiveCommissionMaximum(rule.maxAmount))}
          </Field>
          <Field label={t("admin.finance.commission.sellerCommission")}>
            {percent(rule.sellerCommissionRate)}
          </Field>
          <Field label={t("admin.finance.commission.sellerPlatformFee")}>
            {percent(rule.sellerPlatformFeeRate)}
          </Field>
          <Field label={t("admin.finance.commission.buyerCommission")}>
            {percent(rule.buyerCommissionRate)}
          </Field>
          <Field label={t("admin.finance.commission.buyerServiceFee")}>
            {percent(rule.buyerServiceFeeRate)}
          </Field>
          <Field label={t("admin.finance.commission.tradeFeeSeller")}>
            {fmtTry(rule.tradeFeeSellerAmount)}
          </Field>
          <Field label={t("admin.finance.commission.tradeFeeBuyer")}>
            {fmtTry(rule.tradeFeeBuyerAmount)}
          </Field>
        </DataList>
      </div>
    </Modal>
  );
}
