import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { commissionRowMenu } from "./rowActions";
import { type CommissionRule, sellerTypeLabel, appliesToLabel } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

const rate = (v: number | null) => (v !== null ? `%${v.toFixed(2)}` : "—");

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
      t("admin.finance.commission.appliesTo"),
      (r) => appliesToLabel(r.appliesTo, t),
      {
        sortKey: "appliesTo",
        sortType: "text",
      },
    ),
    col.custom<CommissionRule>(
      t("admin.finance.commission.sellerRate"),
      (r) => (
        <span className="font-semibold tabular-nums text-primary-700">
          {rate(r.sellerRate)}
        </span>
      ),
      { align: "right", sortKey: "sellerRate", sortType: "number" },
    ),
    col.custom<CommissionRule>(
      t("admin.finance.commission.buyerRate"),
      (r) => (
        <span className="font-semibold tabular-nums text-primary-700">
          {rate(r.buyerRate)}
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
