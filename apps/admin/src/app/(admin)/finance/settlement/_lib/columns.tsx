/** @format */

import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { fmtTry } from "@/lib/format";
import type { SettlementRow } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Ekranda dökümün ÖZETİ durur; 21 kolonun tamamı Excel'dedir. Tabloyu yatay
 * olarak 21 kolona yaymak admin için okunmaz hale getirirdi — ekranın işi
 * doğrulama, dosyanın işi müşavire gitmek.
 */
export const settlementColumns = (t: T) => [
  col.custom<SettlementRow>(
    t("admin.finance.settlement.columns.record"),
    (r) => (
      <div>
        <p className="whitespace-nowrap font-mono text-sm font-medium text-heading">
          {r.recordNo}
        </p>
        <p className="font-mono text-xs text-muted">{r.orderNumber}</p>
      </div>
    ),
    { grow: 2, minWidth: 160, sortKey: "recordNo", sortType: "text" },
  ),
  col.badge<SettlementRow>(
    t("admin.finance.settlement.columns.transactionType"),
    (r) => <Badge variant="secondary">{r.transactionType}</Badge>,
  ),
  col.user<SettlementRow>(
    t("admin.finance.settlement.columns.seller"),
    (r) => ({
      name: r.sellerName || "—",
      secondary: r.sellerCompanyName || undefined,
    }),
  ),
  col.custom<SettlementRow>(
    t("admin.finance.settlement.columns.product"),
    (r) => (
      <div className="max-w-[260px]">
        <p className="truncate text-sm text-heading">{r.productName || "—"}</p>
        <p className="font-mono text-xs text-muted">{r.productCode}</p>
      </div>
    ),
    { grow: 2, minWidth: 180 },
  ),
  col.custom<SettlementRow>(
    t("admin.finance.settlement.columns.commission"),
    (r) => (
      <div className="whitespace-nowrap text-sm tabular-nums">
        <p className="font-medium text-heading">{fmtTry(r.platformEarning)}</p>
        <p className="text-xs text-muted">
          {r.commissionRate != null ? `%${r.commissionRate}` : "—"}
        </p>
      </div>
    ),
    { align: "right", minWidth: 120 },
  ),
  col.custom<SettlementRow>(
    t("admin.finance.settlement.columns.sellerEarning"),
    (r) => (
      <div className="whitespace-nowrap text-sm tabular-nums">
        <p className="font-medium text-heading">{fmtTry(r.sellerEarning)}</p>
        {r.withholdingTax > 0 && (
          <p className="text-xs text-muted">
            {t("admin.finance.settlement.columns.withholding")}:{" "}
            {fmtTry(r.withholdingTax)}
          </p>
        )}
      </div>
    ),
    { align: "right", minWidth: 140 },
  ),
  col.custom<SettlementRow>(
    t("admin.finance.settlement.columns.maturity"),
    (r) => (
      <div className="whitespace-nowrap text-sm">
        <p className="text-heading">
          {r.maturityAt
            ? new Date(r.maturityAt).toLocaleDateString("tr-TR")
            : "—"}
        </p>
        <p className="text-xs text-muted">
          {r.maturityDays != null
            ? t("admin.finance.settlement.columns.maturityDays", {
                days: r.maturityDays,
              })
            : "—"}
        </p>
      </div>
    ),
    { minWidth: 130 },
  ),
];
