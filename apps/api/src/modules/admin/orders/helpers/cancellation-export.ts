import {
  ADMIN_CANCEL_REASON_I18N_KEYS,
  ADMIN_CANCELLATION_ADMIN_REASON_ANY,
  ADMIN_CANCELLATION_BUCKET_I18N_KEYS,
  ADMIN_CANCELLATION_REFUND_STATE_I18N_KEYS,
  ADMIN_CANCELLATION_TAB_I18N_KEYS,
  type CANCELLATION_EXPORT_PARENT_KEYS,
  type EXPORT_CATALOGS,
  type AdminCancellationInfo,
  type AdminCancellationRow,
  type ExportCatalogKey,
  cancellationActorI18nKey,
  cancellationReasonMessage,
  resolveAdminCancellationAdminReason,
} from "@tarodan/types";
import type {
  ExportRecord,
  ExportSummaryEntry,
  Translate,
} from "../../../../common/export";
import type { CancellationListRequest } from "../admin-cancellation.service";
import { cancellationScopeOf } from "./cancellation-where";

const HEADER = "admin.operations.cancellations.export";

type CancellationKey = ExportCatalogKey<typeof EXPORT_CATALOGS.cancellations>;
type ParentKey = (typeof CANCELLATION_EXPORT_PARENT_KEYS)[number];

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
 * İptaller dökümünün satırları — UZUN biçim: kayıt (sepet / sipariş / takas)
 * başına değil, iptal KALEMİ başına bir satır. Üst kaydın kolonları
 * (`CANCELLATION_EXPORT_PARENT_KEYS`) her kalemde tekrarlanır; kaydın tutarı
 * veri sayfasında değil Özet'te toplanır. Etiketler panelin katalog
 * anahtarlarından; tutarlar sayı.
 */
export function cancellationExportRecords(
  row: AdminCancellationRow,
  t: Translate,
): ExportRecord<CancellationKey>[] {
  const parent: ExportRecord<ParentKey> = {
    rowNumber: row.number,
    // Test şeridi kaydı dökümden çıkarılmaz (liste gibi) — işaretlenir.
    testLane: row.isTest,
    origin: t(`${HEADER}.originValue.${row.origin}`),
    orderDate: row.createdAt,
    buyer: row.buyer.displayName,
    buyerCode: row.buyer.code,
  };
  const lines = row.packages.flatMap((pkg) =>
    pkg.lines.map((line): ExportRecord<CancellationKey> => {
      const info = row.cancellations[line.orderId];
      return {
        ...parent,
        orderNumber: line.orderNumber,
        seller: pkg.seller.displayName,
        sellerCode: pkg.seller.code,
        product: line.product.title,
        productCode: line.product.productCode,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        subtotal: line.subtotal,
        cancelledAt: info?.cancelledAt,
        cancelledBy: t(cancellationActorI18nKey(info?.cancelledBy ?? null)),
        reason: cancellationReasonText(info, t),
        refundState: info
          ? t(ADMIN_CANCELLATION_REFUND_STATE_I18N_KEYS[info.refundState])
          : null,
      };
    }),
  );
  // Kalemi olmayan kayıt (olmamalı) yine de dosyada görünsün — sayım tutsun.
  return lines.length > 0 ? lines : [parent];
}

/** Üst kayıtların tutar toplamı — Özet'e; veri sayfasında toplanmaz. */
export function cancellationExportTotals(
  rows: readonly AdminCancellationRow[],
): ExportSummaryEntry[] {
  const total = rows.reduce((sum, row) => sum + row.totalAmount, 0);
  return [
    {
      labelKey: "server.export.summary.parentTotal",
      value: Math.round(total * 100) / 100,
      type: "money",
    },
  ];
}

/** Özet'teki filtreler: sekme, alt sekme ve metin filtreleri (taraf terimi YOK). */
export function cancellationExportFilters(
  query: CancellationListRequest,
): ExportSummaryEntry[] {
  const { tab, bucket } = cancellationScopeOf(query);
  const adminReason = resolveAdminCancellationAdminReason(query.adminReason);
  return [
    {
      labelKey: "server.export.summary.tab",
      value: tab,
      valueKey: ADMIN_CANCELLATION_TAB_I18N_KEYS[tab],
    },
    {
      labelKey: "server.export.summary.subTab",
      value: bucket,
      valueKey: ADMIN_CANCELLATION_BUCKET_I18N_KEYS[bucket],
    },
    {
      labelKey: "admin.operations.cancellations.filters.orderNumber",
      value: query.orderNumber,
    },
    {
      labelKey: "admin.operations.cancellations.filters.cargoCode",
      value: query.cargoCode,
    },
    {
      labelKey: "admin.operations.cancellations.filters.groupNumber",
      value: query.groupNumber,
    },
    {
      // Ad / e-posta / kullanıcı kodu olabilir: terim yazılmaz.
      labelKey: "admin.operations.cancellations.filters.party",
      value: query.party,
      redacted: true,
    },
    {
      labelKey: "admin.operations.cancellations.filters.adminReason",
      value: adminReason,
      valueKey: !adminReason
        ? undefined
        : adminReason === ADMIN_CANCELLATION_ADMIN_REASON_ANY
          ? "admin.operations.cancellations.filters.adminReasonAny"
          : ADMIN_CANCEL_REASON_I18N_KEYS[adminReason],
    },
    { labelKey: "admin.finance.common.startDate", value: query.startDate },
    { labelKey: "admin.finance.common.endDate", value: query.endDate },
  ];
}
