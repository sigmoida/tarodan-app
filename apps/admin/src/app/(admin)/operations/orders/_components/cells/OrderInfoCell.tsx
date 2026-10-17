import { TextLink } from "@/components/TextLink";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import type { AdminOrderListRow } from "@tarodan/types";
import { fmtDateTime } from "@/lib/format";
import { TruncatedText } from "@/components/table";
import { TestLaneBadge } from "@/components/TestLaneBadge";
import { nearestPreparingDeadline, rowDetailHref } from "../../_lib/rowView";

/**
 * Sipariş Bilgileri: satır numarası (GRP / ORD), oluşturulma zamanı ve teklif
 * siparişinde teklif rozeti, test şeridi kaydında "TEST" rozeti. Açık bir hazırlama
 * süresi varsa en yakını da gösterilir — "Yeni" kovasında operatörün baktığı
 * ilk tarih odur; tek seferlik uzatma kullanıldıysa bu da yazılır.
 */
export function OrderInfoCell({ row }: { row: AdminOrderListRow }) {
  const t = useTranslations();
  const preparing = nearestPreparingDeadline(row);

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <TextLink href={rowDetailHref(row)} className="block max-w-full">
        <TruncatedText className="font-mono font-medium">
          {row.number}
        </TruncatedText>
      </TextLink>
      <span className="whitespace-nowrap text-xs text-muted">
        {fmtDateTime(row.createdAt)}
      </span>
      {row.origin === "offer" && (
        <Badge variant="default">
          {t("admin.operations.orders.cells.offerBadge")}
        </Badge>
      )}
      <TestLaneBadge isTest={row.isTest} />
      {preparing && (
        <span className="whitespace-nowrap text-xs text-warning-600">
          {t("admin.operations.orders.cells.preparingDeadline", {
            date: fmtDateTime(preparing.deadline) ?? "—",
          })}
        </span>
      )}
      {preparing?.extended && (
        <span className="whitespace-nowrap text-xs text-danger-600">
          {t("admin.operations.orders.cells.preparingExtended")}
        </span>
      )}
    </div>
  );
}
