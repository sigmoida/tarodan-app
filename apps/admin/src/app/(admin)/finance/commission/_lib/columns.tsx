import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { commissionRowMenu } from "./rowActions";
import {
  type CommissionRule,
  sellerTypeLabel,
  taxpayerTypeLabel,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

const rate = (v: number | null | undefined) =>
  v != null ? `%${v.toFixed(2)}` : "—";

/** Tiered amount range, e.g. "0 – 1000", "1000+", or "—". */
const tier = (r: CommissionRule) => {
  if (r.minAmount == null && r.maxAmount == null) return "—";
  if (r.maxAmount == null) return `${r.minAmount ?? 0}+`;
  return `${r.minAmount ?? 0} – ${r.maxAmount}`;
};

export interface CommissionColumnProps {
  onEdit: (r: CommissionRule) => void;
  onDelete: (r: CommissionRule) => void;
  onToggle: (r: CommissionRule) => void;
  togglingId?: string;
}

export function commissionColumns(
  { onEdit, onDelete, onToggle, togglingId }: CommissionColumnProps,
  t: T,
) {
  return [
    col.text<CommissionRule>(t("admin.finance.commission.ruleName"), "name"),
    col.muted<CommissionRule>(
      t("common.category"),
      (r) => r.categoryName || t("common.all"),
      {
        sortKey: "categoryName",
        sortType: "text",
      },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.sellerType"),
      (r) => sellerTypeLabel(r.sellerType, t),
      {
        sortKey: "sellerType",
        sortType: "text",
      },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.taxpayerType"),
      (r) => taxpayerTypeLabel(r.taxpayerType, t),
      { sortKey: "taxpayerType", sortType: "text" },
    ),
    col.muted<CommissionRule>(
      t("admin.finance.commission.minAmountLabel"),
      (r) => tier(r),
      { sortKey: "minAmount", sortType: "number" },
    ),
    col.custom<CommissionRule>(
      t("admin.finance.commission.sellerCommission"),
      (r) => (
        <span className="font-semibold tabular-nums text-primary-700">
          {rate(r.sellerCommissionRate ?? r.sellerRate)}
        </span>
      ),
      { align: "right", sortKey: "sellerRate", sortType: "number" },
    ),
    col.custom<CommissionRule>(
      t("admin.finance.commission.buyerServiceFee"),
      (r) => (
        <span className="font-semibold tabular-nums text-primary-700">
          {rate(r.buyerServiceFeeRate ?? r.buyerRate)}
        </span>
      ),
      { align: "right", sortKey: "buyerRate", sortType: "number" },
    ),
    col.badge<CommissionRule>(
      t("common.status"),
      (r) => <Badge active={r.isActive} />,
      {
        sortKey: "isActive",
        sortType: "number",
      },
    ),
    col.rowMenu<CommissionRule>(
      commissionRowMenu({ onEdit, onDelete, onToggle, togglingId }),
    ),
  ];
}
