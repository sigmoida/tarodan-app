import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import type { AdminCancellationRow } from "@tarodan/types";
import { fmtDateTime } from "@/lib/format";
import { TruncatedText } from "@/components/table";
import {
  cancellationDetailHref,
  cancellationStatusKey,
  isPartialCancellation,
} from "../../_lib/cancellationView";

/**
 * Sipariş Bilgileri: satır numarası (GRP / ORD / TKS), oluşturulma zamanı,
 * durum ve kaynak rozeti. Kısmen iptal edilmiş sepette kaç kalemin iptal
 * edildiği yazılır — satır yalnız iptal kalemlerini gösterir.
 */
export function CancellationInfoCell({ row }: { row: AdminCancellationRow }) {
  const t = useTranslations();
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <Link
        href={cancellationDetailHref(row)}
        className="block max-w-full text-primary-600 hover:underline"
      >
        <TruncatedText className="font-mono font-medium">
          {row.number}
        </TruncatedText>
      </Link>
      <span className="whitespace-nowrap text-xs text-muted">
        {fmtDateTime(row.createdAt)}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={row.status === "rejected" ? "warning" : "danger"}>
          {t(cancellationStatusKey(row.status))}
        </Badge>
        {row.origin === "offer" && (
          <Badge variant="info">
            {t("admin.operations.orders.cells.offerBadge")}
          </Badge>
        )}
        {row.origin === "trade" && (
          <Badge variant="info">
            {t("admin.operations.cancellations.cells.tradeBadge")}
          </Badge>
        )}
      </div>
      {isPartialCancellation(row) && (
        <span className="whitespace-nowrap text-xs text-warning-600">
          {t("admin.operations.cancellations.cells.partial", {
            cancelled: row.lineCounts.cancelled,
            total: row.lineCounts.total,
          })}
        </span>
      )}
    </div>
  );
}
