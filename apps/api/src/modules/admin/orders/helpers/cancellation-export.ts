import {
  ADMIN_CANCELLATION_REFUND_STATE_I18N_KEYS,
  cancellationActorI18nKey,
  cancellationReasonMessage,
  type AdminCancellationInfo,
  type AdminCancellationRow,
  type AdminOrderLine,
  type AdminOrderPackage,
} from "@tarodan/types";
import {
  renderSheet,
  type ExportColumn,
  type RenderedSheet,
} from "../../../../common/helpers/tabular-export";

/** Katalog anahtarını isteğin dilinde metne çeviren fonksiyon. */
export type Translate = (key: string) => string;

/** Dışa aktarım satırı: bir iptal KALEMİ (satır başına değil — Excel düz ister). */
export interface CancellationExportLine {
  row: AdminCancellationRow;
  pkg: AdminOrderPackage;
  line: AdminOrderLine;
  info: AdminCancellationInfo | undefined;
}

const HEADER = "admin.operations.cancellations.export";

export function flattenCancellationRows(
  rows: readonly AdminCancellationRow[],
): CancellationExportLine[] {
  return rows.flatMap((row) =>
    row.packages.flatMap((pkg) =>
      pkg.lines.map((line) => ({
        row,
        pkg,
        line,
        info: row.cancellations[line.orderId],
      })),
    ),
  );
}

/** İptal nedeninin metni — panel ile aynı çözüm (`cancellationReasonMessage`). */
export function cancellationReasonText(
  info: AdminCancellationInfo | undefined,
  t: Translate,
): string {
  if (!info) return "";
  const message = cancellationReasonMessage(info.reason);
  return "key" in message ? t(message.key) : message.text;
}

/**
 * İptaller sekmesinin Excel sayfası. Başlıklar ve etiketler panelin katalog
 * anahtarlarından (tek kaynak); tutarlar sayı olarak yazılır.
 */
export function cancellationExportSheet(
  rows: readonly AdminCancellationRow[],
  t: Translate,
): RenderedSheet {
  const columns: ExportColumn<CancellationExportLine>[] = [
    { header: t(`${HEADER}.rowNumber`), value: (x) => x.row.number },
    {
      header: t(`${HEADER}.origin`),
      value: (x) => t(`${HEADER}.originValue.${x.row.origin}`),
    },
    { header: t(`${HEADER}.orderNumber`), value: (x) => x.line.orderNumber },
    { header: t(`${HEADER}.orderDate`), value: (x) => x.row.createdAt },
    { header: t(`${HEADER}.buyer`), value: (x) => x.row.buyer.displayName },
    { header: t(`${HEADER}.buyerCode`), value: (x) => x.row.buyer.code },
    { header: t(`${HEADER}.seller`), value: (x) => x.pkg.seller.displayName },
    { header: t(`${HEADER}.sellerCode`), value: (x) => x.pkg.seller.code },
    { header: t(`${HEADER}.product`), value: (x) => x.line.product.title },
    {
      header: t(`${HEADER}.productCode`),
      value: (x) => x.line.product.productCode,
    },
    { header: t(`${HEADER}.quantity`), value: (x) => x.line.quantity },
    { header: t(`${HEADER}.unitPrice`), value: (x) => x.line.unitPrice },
    { header: t(`${HEADER}.subtotal`), value: (x) => x.line.subtotal },
    {
      header: t(`${HEADER}.cancelledAt`),
      value: (x) => x.info?.cancelledAt ?? "",
    },
    {
      header: t(`${HEADER}.cancelledBy`),
      value: (x) => t(cancellationActorI18nKey(x.info?.cancelledBy ?? null)),
    },
    {
      header: t(`${HEADER}.reason`),
      value: (x) => cancellationReasonText(x.info, t),
    },
    {
      header: t(`${HEADER}.refundState`),
      value: (x) =>
        x.info
          ? t(ADMIN_CANCELLATION_REFUND_STATE_I18N_KEYS[x.info.refundState])
          : "",
    },
  ];
  return renderSheet(
    t(`${HEADER}.sheetName`),
    columns,
    flattenCancellationRows(rows),
  );
}
