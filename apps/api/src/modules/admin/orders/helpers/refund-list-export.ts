import {
  ADMIN_REFUND_BUCKET_I18N_KEYS,
  ADMIN_REFUND_MONEY_STATUS_I18N_KEYS,
  ADMIN_REFUND_ORIGIN_I18N_KEYS,
  ADMIN_REFUND_TAB_I18N_KEYS,
  ADMIN_REFUND_TRADE_ROLE_I18N_KEYS,
  ADMIN_REFUND_WAREHOUSE_DECISION_I18N_KEYS,
  REFUND_REQUEST_KIND_I18N_KEYS,
  adminRefundReasonI18nKey,
  adminRefundStatusI18nKey,
  type AdminRefundRow,
  type EXPORT_CATALOGS,
  type ExportCatalogKey,
} from "@tarodan/types";
import type {
  ExportRecord,
  ExportSummaryEntry,
  Translate,
} from "../../../../common/export";
import { refundListScopeOf, type RefundListQuery } from "./refund-list-where";

type RefundExportKey = ExportCatalogKey<typeof EXPORT_CATALOGS.refundRequests>;

const shipmentStatus = (status: string | null | undefined, t: Translate) =>
  status ? t(`status.shipment.${status}`) : null;

/** Satırın neden metni: katalog etiketi; kod yoksa boş (serbest metin `note`'ta). */
export function refundReasonText(row: AdminRefundRow, t: Translate): string {
  const key = adminRefundReasonI18nKey(row.origin, row.reason.code);
  if (key) return t(key);
  return row.reason.label ?? "";
}

/**
 * İadeler dökümünün satırı — liste satırı başına bir satır (takas zaten
 * taraf başına iki satır gelir). Etiketler panelin katalog anahtarlarından;
 * tutarlar sayı, oranlar yüzde sayı.
 */
export function refundExportRecord(
  row: AdminRefundRow,
  t: Translate,
): ExportRecord<RefundExportKey> {
  return {
    refundNo: row.refundNo,
    refundDate: row.createdAt,
    // Test şeridi kaydı dökümden çıkarılmaz (liste gibi) — işaretlenir.
    testLane: row.isTest,
    origin: t(ADMIN_REFUND_ORIGIN_I18N_KEYS[row.origin]),
    kind: t(REFUND_REQUEST_KIND_I18N_KEYS[row.kind]),
    tradeRole: row.trade
      ? t(ADMIN_REFUND_TRADE_ROLE_I18N_KEYS[row.trade.role])
      : null,
    orderNumber: row.order.orderNumber,
    orderDate: row.order.createdAt,
    groupNumber: row.order.groupNumber ?? null,
    buyer: row.buyer.name,
    buyerCode: row.buyer.code,
    seller: row.seller.name,
    sellerCode: row.seller.code,
    product: row.product.title,
    productCode: row.product.productCode,
    quantity: row.product.quantity,
    refundQuantity: row.product.refundQuantity,
    unitPrice: row.money.unitPrice,
    commissionRate: row.money.commissionRate,
    commissionAmount: row.money.commissionAmount,
    refundableCommissionRate: row.money.refundableCommissionRate,
    refundableCommissionAmount: row.money.refundableCommissionAmount,
    listingCommissionAmount: row.money.listingCommissionAmount ?? null,
    offerCommissionAmount: row.money.offerCommissionAmount ?? null,
    priceDifference: row.money.priceDifference ?? null,
    buyerDeduction: row.money.buyerDeduction,
    sellerDeduction: row.money.sellerDeduction,
    refundAmount: row.money.refundAmount,
    moneyStatus: t(ADMIN_REFUND_MONEY_STATUS_I18N_KEYS[row.money.status]),
    refundedAt: row.money.refundedAt,
    packageTrackingNo: row.order.packageTrackingNo ?? null,
    returnTrackingNo: row.returnShipment?.trackingNo ?? null,
    returnShipmentStatus: shipmentStatus(row.returnShipment?.status, t),
    warehouseArrival: shipmentStatus(row.warehouse?.arrivalStatus, t),
    warehouseDecision: row.warehouse?.decision
      ? t(ADMIN_REFUND_WAREHOUSE_DECISION_I18N_KEYS[row.warehouse.decision])
      : null,
    warehouseOutboundAt: row.warehouse?.outboundAt ?? null,
    returnToCustomersStatus: shipmentStatus(
      row.warehouse?.returnToCustomersStatus,
      t,
    ),
    reason: refundReasonText(row, t),
    note: row.reason.note,
    status: t(adminRefundStatusI18nKey(row.origin, row.status)),
    completedAt: row.completedAt,
    returnInvoiceNumber: row.returnInvoice?.number ?? null,
    returnInvoiceStatus: row.returnInvoice
      ? t(`admin.finance.invoices.status.${row.returnInvoice.status}`)
      : null,
  };
}

/** İade tutarlarının toplamı — Özet'e. */
export function refundExportTotals(
  rows: readonly AdminRefundRow[],
): ExportSummaryEntry[] {
  const cents = rows.reduce(
    (sum, row) => sum + Math.round(row.money.refundAmount * 100),
    0,
  );
  return [
    {
      labelKey: "admin.operations.refunds.export.refundTotal",
      value: cents / 100,
      type: "money",
    },
  ];
}

/** Özet'teki filtreler: sekme, alt sekme, tür ve tarih aralığı (arama terimi YOK). */
export function refundExportFilters(
  query: RefundListQuery,
): ExportSummaryEntry[] {
  const { tab, bucket, filters } = refundListScopeOf(query);
  return [
    {
      labelKey: "server.export.summary.tab",
      value: tab,
      valueKey: ADMIN_REFUND_TAB_I18N_KEYS[tab],
    },
    {
      labelKey: "server.export.summary.subTab",
      value: bucket,
      valueKey: ADMIN_REFUND_BUCKET_I18N_KEYS[bucket],
    },
    {
      labelKey: "admin.operations.refundRequests.kind.label",
      value: filters.kind,
      valueKey: filters.kind
        ? REFUND_REQUEST_KIND_I18N_KEYS[filters.kind]
        : undefined,
    },
    { labelKey: "admin.finance.common.startDate", value: filters.dateFrom },
    { labelKey: "admin.finance.common.endDate", value: filters.dateTo },
  ];
}
