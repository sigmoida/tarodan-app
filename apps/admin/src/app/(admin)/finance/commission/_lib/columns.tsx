import { col } from "@/components/table";
import { commissionRowMenu } from "./rowActions";
import { type CommissionRule, sellerTypeLabel } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

const rate = (value: number) => `%${value.toFixed(2)}`;
const range = (rule: CommissionRule) =>
  rule.maxAmount == null
    ? `[${rule.minAmount}, ∞)`
    : `[${rule.minAmount}, ${rule.maxAmount})`;

export function commissionColumns(
  {
    onEdit,
    onDelete,
  }: {
    onEdit: (rule: CommissionRule) => void;
    onDelete: (rule: CommissionRule) => void;
  },
  t: T,
) {
  return [
    col.text<CommissionRule>(t("admin.finance.commission.ruleName"), "name", {
      wrap: true,
      minWidth: 240,
    }),
    col.muted<CommissionRule>(
      t("common.category"),
      (rule) => rule.categoryName,
      { sortKey: "categoryName", sortType: "text" },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.sellerType"),
      (rule) => sellerTypeLabel(rule.sellerType, t),
      { sortKey: "sellerType", sortType: "text" },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.minAmountLabel"),
      range,
      { sortKey: "minAmount", sortType: "number" },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.sellerCommission"),
      (rule) => rate(rule.sellerCommissionRate),
      { sortKey: "sellerCommissionRate", sortType: "number" },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.buyerServiceFee"),
      (rule) => rate(rule.buyerServiceFeeRate),
      { sortKey: "buyerServiceFeeRate", sortType: "number" },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.tradeFeeColumn"),
      (rule) =>
        `${rule.tradeFeeSellerAmount.toFixed(2)} / ${rule.tradeFeeBuyerAmount.toFixed(2)} ₺`,
      { sortKey: "tradeFeeSellerAmount", sortType: "number" },
    ),
    col.rowMenu<CommissionRule>(commissionRowMenu({ onEdit, onDelete })),
  ];
}
