import { col } from "@/components/table";
import { vatOverrideRowMenu } from "./rowActions";
import type { VatOverride, WithholdingReport, TaxReport } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

type WhRow = WithholdingReport["rows"][number];
type ReportRow = TaxReport["breakdown"][number];

export function vatColumns(onDelete: (o: VatOverride) => void, t: T) {
  return [
    col.text<VatOverride>(t("common.category"), (o) => o.categoryName, {
      sortKey: "categoryName",
    }),
    col.muted<VatOverride>(
      t("admin.finance.tax.vatPercent"),
      (o) => `%${o.rate}`,
      { sortKey: "rate" },
    ),
    col.rowMenu<VatOverride>(vatOverrideRowMenu(onDelete, t)),
  ];
}

export const withholdingColumns = (t: T) => [
  col.text<WhRow>(t("admin.finance.common.seller"), (r) => r.sellerName, {
    sortKey: "sellerName",
  }),
  col.muted<WhRow>("VKN / TCKN", (r) => r.taxId || "–", { sortKey: "taxId" }),
  col.muted<WhRow>(t("common.email"), (r) => r.email || "–", {
    sortKey: "email",
  }),
  col.number<WhRow>(t("admin.finance.tax.transfer"), (r) => r.transferCount, {
    sortKey: "transferCount",
  }),
  col.money<WhRow>(t("admin.finance.tax.gross"), (r) => r.grossAmount, {
    sortKey: "grossAmount",
  }),
  col.money<WhRow>(
    t("admin.finance.tax.withholding"),
    (r) => r.withholdingTax,
    { sortKey: "withholdingTax" },
  ),
];

export const taxReportColumns = (t: T) => [
  col.text<ReportRow>(t("admin.finance.tax.period"), (r) => r.period, {
    sortKey: "period",
  }),
  col.money<ReportRow>(t("admin.finance.tax.tax"), (r) => r.taxCollected, {
    sortKey: "taxCollected",
  }),
  col.money<ReportRow>(t("admin.finance.tax.revenue"), (r) => r.revenue, {
    sortKey: "revenue",
  }),
  col.number<ReportRow>(t("common.quantity"), (r) => r.count, {
    sortKey: "count",
  }),
];
