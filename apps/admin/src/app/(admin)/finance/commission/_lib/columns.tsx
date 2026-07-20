import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { commissionRowMenu } from "./rowActions";
import { type CommissionRule, sellerTypeLabel, appliesToLabel } from "./types";

const rate = (v: number | null) => (v !== null ? `%${v.toFixed(2)}` : "—");

export interface CommissionColumnProps {
  onEdit: (r: CommissionRule) => void;
  onDelete: (r: CommissionRule) => void;
  onToggle: (r: CommissionRule) => void;
  togglingId?: string;
}

export function commissionColumns({
  onEdit,
  onDelete,
  onToggle,
}: CommissionColumnProps) {
  return [
    col.text<CommissionRule>("Kural Adı", "name"),
    col.muted<CommissionRule>("Kategori", (r) => r.categoryName || "Tümü", {
      sortKey: "categoryName",
      sortType: "text",
    }),
    col.muted<CommissionRule>(
      "Satıcı Tipi",
      (r) => sellerTypeLabel(r.sellerType),
      {
        sortKey: "sellerType",
        sortType: "text",
      },
    ),
    col.muted<CommissionRule>("Uygulanan", (r) => appliesToLabel(r.appliesTo), {
      sortKey: "appliesTo",
      sortType: "text",
    }),
    col.custom<CommissionRule>(
      "Satıcı Oranı",
      (r) => (
        <span className="font-semibold text-primary-700">
          {rate(r.sellerRate)}
        </span>
      ),
      { sortKey: "sellerRate", sortType: "number" },
    ),
    col.custom<CommissionRule>(
      "Alıcı Oranı",
      (r) => (
        <span className="font-semibold text-primary-700">
          {rate(r.buyerRate)}
        </span>
      ),
      { sortKey: "buyerRate", sortType: "number" },
    ),
    col.badge<CommissionRule>("Durum", (r) => <Badge active={r.isActive} />, {
      sortKey: "isActive",
      sortType: "number",
    }),
    col.rowMenu<CommissionRule>(
      commissionRowMenu({ onEdit, onDelete, onToggle }),
    ),
  ];
}
