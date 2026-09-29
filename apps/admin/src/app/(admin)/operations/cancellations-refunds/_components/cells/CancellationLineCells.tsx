import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import {
  ADMIN_CANCELLATION_REFUND_STATE_I18N_KEYS,
  type AdminCancellationInfo,
  type AdminCancellationRow,
} from "@tarodan/types";
import { fmtDateTime } from "@/lib/format";
import { TruncatedText } from "@/components/table";
import { PackageStack } from "@/app/(admin)/operations/orders/_components/cells/PackageStack";
import {
  cancellationActorLabel,
  cancellationReasonLabel,
  lineCancellation,
  refundStateVariant,
} from "../../_lib/cancellationView";

/**
 * Kalem bazlı iptal kolonları. Ürün kolonuyla AYNI paket iskeletini
 * (`PackageStack`) kullanırlar: çok satıcılı sepette her iptal kaleminin
 * tarihi, nedeni ve iade durumu kendi ürününün hizasında durur.
 */
function CancellationLines({
  row,
  render,
}: {
  row: AdminCancellationRow;
  render: (info: AdminCancellationInfo | undefined) => ReactNode;
}) {
  return (
    <PackageStack
      packages={row.packages}
      line={(line) => render(lineCancellation(row, line.orderId))}
    />
  );
}

/** İptal tarihi + iptal eden (damgası olmayan eski iptalde "tarih yok"). */
export function CancelledAtCell({ row }: { row: AdminCancellationRow }) {
  const t = useTranslations();
  return (
    <CancellationLines
      row={row}
      render={(info) => (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="whitespace-nowrap text-sm text-body">
            {info?.cancelledAt
              ? fmtDateTime(info.cancelledAt)
              : t("admin.operations.cancellations.cells.noDate")}
          </span>
          <span className="truncate text-xs text-muted">
            {t("admin.operations.cancellations.cells.cancelledBy", {
              actor: cancellationActorLabel(info?.cancelledBy, t),
            })}
          </span>
        </div>
      )}
    />
  );
}

/** İptal nedeni: alıcı kodu etiketi, "Süresi Dolan", serbest metin ya da "—". */
export function CancelReasonCell({ row }: { row: AdminCancellationRow }) {
  const t = useTranslations();
  return (
    <CancellationLines
      row={row}
      render={(info) => (
        <TruncatedText className="text-sm text-body">
          {cancellationReasonLabel(info, t)}
        </TruncatedText>
      )}
    />
  );
}

/** İptalin iade durumu (tahsilat yok / bekliyor / incelemede / edildi / başarısız). */
export function RefundStateCell({ row }: { row: AdminCancellationRow }) {
  const t = useTranslations();
  return (
    <CancellationLines
      row={row}
      render={(info) =>
        info ? (
          <Badge variant={refundStateVariant(info.refundState)}>
            {t(ADMIN_CANCELLATION_REFUND_STATE_I18N_KEYS[info.refundState])}
          </Badge>
        ) : (
          <span className="text-subtle">—</span>
        )
      }
    />
  );
}
