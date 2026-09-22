import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import type { AdminOrderListRow } from "@tarodan/types";
import { fmtDateTime } from "@/lib/format";
import { TruncatedText } from "@/components/table";
import { TestLaneBadge } from "@/components/TestLaneBadge";
import { rowDetailHref, rowLines } from "../../_lib/rowView";

/**
 * Sipariş Bilgileri: satır numarası (GRP / ORD), oluşturulma zamanı ve teklif
 * siparişinde teklif rozeti, test şeridi kaydında "TEST" rozeti. Açık bir hazırlama
 * süresi varsa en yakını da gösterilir — "Yeni" kovasında operatörün baktığı
 * ilk tarih odur.
 */
export function OrderInfoCell({ row }: { row: AdminOrderListRow }) {
  const t = useTranslations();
  const deadline = rowLines(row)
    .filter((line) => line.status === "paid" || line.status === "preparing")
    .map((line) => line.preparingDeadline)
    .filter((value): value is string => !!value)
    .sort()[0];

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <Link
        href={rowDetailHref(row)}
        className="block max-w-full text-primary-600 hover:underline"
      >
        <TruncatedText className="font-mono font-medium">
          {row.number}
        </TruncatedText>
      </Link>
      <span className="whitespace-nowrap text-xs text-muted">
        {fmtDateTime(row.createdAt)}
      </span>
      {row.origin === "offer" && (
        <Badge variant="info">
          {t("admin.operations.orders.cells.offerBadge")}
        </Badge>
      )}
      <TestLaneBadge isTest={row.isTest} />
      {deadline && (
        <span className="whitespace-nowrap text-xs text-warning-600">
          {t("admin.operations.orders.cells.preparingDeadline", {
            date: fmtDateTime(deadline) ?? "—",
          })}
        </span>
      )}
    </div>
  );
}
