import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import type { AdminOrderListRow } from "@tarodan/types";
import { invoiceStatusConfig } from "@/app/(admin)/finance/invoices/_lib/types";
import { invoiceSearchHref, invoiceStatusSummary } from "../../_lib/rowView";
import { PackageStack } from "./PackageStack";

/**
 * Paketin e-Logo belgeleri: durum başına adet rozetleri ve belgeleri fatura
 * ekranında açan bağlantı (indirme, yeniden gönderme orada). Durum etiketleri
 * fatura ekranınınkilerle aynı haritadan gelir.
 */
export function InvoiceCell({ row }: { row: AdminOrderListRow }) {
  const t = useTranslations();
  const config = invoiceStatusConfig(t);

  return (
    <PackageStack
      packages={row.packages}
      body={(pkg) => {
        const href = invoiceSearchHref(pkg.packageNumber);
        if (pkg.invoices.length === 0) {
          return (
            <span className="text-xs text-subtle">
              {t("admin.operations.orders.cells.noInvoice")}
            </span>
          );
        }
        return (
          <div className="flex flex-col items-start gap-1">
            <div className="flex flex-wrap gap-1">
              {invoiceStatusSummary(pkg.invoices).map(({ status, count }) => (
                <Badge
                  key={status}
                  status={status}
                  config={config}
                  label={`${count} ${config[status]?.label ?? status}`}
                />
              ))}
            </div>
            {href && (
              <Link
                href={href}
                className="text-xs text-primary-600 hover:underline"
              >
                {t("admin.operations.orders.cells.openInvoices")}
              </Link>
            )}
          </div>
        );
      }}
    />
  );
}
