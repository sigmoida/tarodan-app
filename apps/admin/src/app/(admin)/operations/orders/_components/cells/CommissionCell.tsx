import { useTranslations } from "next-intl";
import type { AdminOrderListRow } from "@tarodan/types";
import { fmtTry } from "@/lib/format";
import { feeRate } from "../../_lib/rowView";

function FeeLine({
  label,
  amount,
  subtotal,
}: {
  label: string;
  amount: number;
  subtotal: number;
}) {
  const rate = feeRate(amount, subtotal);
  return (
    <span className="whitespace-nowrap text-xs tabular-nums text-muted">
      {label} <span className="font-medium text-body">{fmtTry(amount)}</span>
      {rate != null && ` · %${rate}`}
    </span>
  );
}

/**
 * Sepetin tutarı ve platformun iki kesintisi: satış komisyonu ve platform
 * kesintisi (alıcı + satıcı tarafı toplamı), ürün ara toplamına oranlarıyla.
 */
export function CommissionCell({
  row,
}: {
  // Yalnız tutarları okur: İptaller satırı (takas dahil) da aynı alanları taşır.
  row: Pick<AdminOrderListRow, "totalAmount" | "subtotal" | "fees">;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-primary-700">
        {fmtTry(row.totalAmount)}
      </span>
      <FeeLine
        label={t("admin.operations.orders.cells.salesCommission")}
        amount={row.fees.salesCommission}
        subtotal={row.subtotal}
      />
      <FeeLine
        label={t("admin.operations.orders.cells.platformFee")}
        amount={row.fees.platformFee}
        subtotal={row.subtotal}
      />
    </div>
  );
}
