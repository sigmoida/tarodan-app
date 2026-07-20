import { col } from "@/components/table";
import { vatOverrideRowMenu } from "./rowActions";
import type { VatOverride, WithholdingReport, TaxReport } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

type WhRow = WithholdingReport["rows"][number];
type ReportRow = TaxReport["breakdown"][number];

export function vatColumns(onDelete: (o: VatOverride) => void, t: T) {
  return [
    col.text<VatOverride>(t("common.category"), (o) => o.categoryName),
    col.muted<VatOverride>(
      t("admin.finance.tax.vatPercent"),
      (o) => `%${o.rate}`,
    ),
    col.rowMenu<VatOverride>(vatOverrideRowMenu(onDelete, t)),
  ];
}

export const withholdingColumns = (t: T) => [
  col.text<WhRow>(t("admin.finance.common.seller"), (r) => r.sellerName),
  col.muted<WhRow>("VKN / TCKN", (r) => r.taxId || "–"),
  col.muted<WhRow>(t("common.email"), (r) => r.email || "–"),
  col.number<WhRow>(t("admin.finance.tax.transfer"), (r) => r.transferCount),
  col.money<WhRow>(t("admin.finance.tax.gross"), (r) => r.grossAmount),
  col.money<WhRow>(t("admin.finance.tax.withholding"), (r) => r.withholdingTax),
];

export const taxReportColumns = (t: T) => [
  col.text<ReportRow>(t("admin.finance.tax.period"), (r) => r.period),
  col.money<ReportRow>(t("admin.finance.tax.tax"), (r) => r.taxCollected),
  col.money<ReportRow>(t("admin.finance.tax.revenue"), (r) => r.revenue),
  col.number<ReportRow>(t("common.quantity"), (r) => r.count),
];
