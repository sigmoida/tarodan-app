import { getMessages, locales } from "@tarodan/i18n";
import {
  ADMIN_REFUND_BUCKET_I18N_KEYS,
  ADMIN_REFUND_MONEY_STATUS_I18N_KEYS,
  ADMIN_REFUND_ORIGIN_I18N_KEYS,
  ADMIN_REFUND_TAB_I18N_KEYS,
  ADMIN_REFUND_TRADE_ROLE_I18N_KEYS,
  ADMIN_REFUND_WAREHOUSE_DECISION_I18N_KEYS,
  EXPORT_CATALOGS,
  type AdminRefundRow,
} from "@tarodan/types";
import { lookupNode } from "../../../i18n/translate";
import {
  refundExportFilters,
  refundExportRecord,
  refundExportTotals,
  refundReasonText,
} from "./refund-list-export";

/** Anahtarı olduğu gibi döndüren çevirmen: testte etiketin kaynağı görünür. */
const t = (key: string) => `[${key}]`;

function row(overrides: Partial<AdminRefundRow> = {}): AdminRefundRow {
  return {
    id: "rr1",
    refundNo: "RFD-AAA",
    createdAt: "2026-10-10T09:00:00.000Z",
    kind: "return",
    origin: "direct",
    isTest: false,
    order: {
      id: "o1",
      orderNumber: "ORD-AAA",
      createdAt: "2026-10-01T09:00:00.000Z",
      groupNumber: "GRP-AAA",
      packageTrackingNo: "SUR-1",
    },
    buyer: { id: "b1", name: "Ali", code: "B010001" },
    seller: { id: "s1", name: "Veli", code: "K010002" },
    product: {
      id: "p1",
      title: "Model araba",
      productCode: "U010001",
      quantity: 2,
      refundQuantity: 1,
    },
    money: {
      unitPrice: 1000,
      commissionRate: 10,
      commissionAmount: 200,
      refundableCommissionRate: 10,
      refundableCommissionAmount: 100,
      listingCommissionAmount: null,
      offerCommissionAmount: null,
      priceDifference: null,
      buyerDeduction: 30,
      sellerDeduction: 60,
      refundAmount: 1060.1,
      status: "pending",
      refundedAt: null,
    },
    returnShipment: { trackingNo: "SUR-9", status: "in_transit" },
    warehouse: null,
    reason: { code: "damaged", label: null, note: "kutu ezik" },
    status: "return_in_transit",
    completedAt: null,
    returnInvoice: { id: "inv", number: "TRD2026000000009", status: "sent" },
    trade: null,
    ...overrides,
  };
}

describe("refundExportRecord", () => {
  it("writes a request row with catalog labels and numeric money", () => {
    expect(refundExportRecord(row(), t)).toEqual({
      refundNo: "RFD-AAA",
      refundDate: "2026-10-10T09:00:00.000Z",
      testLane: false,
      origin: "[admin.operations.refunds.origin.direct]",
      kind: "[admin.operations.refundRequests.kind.return]",
      tradeRole: null,
      orderNumber: "ORD-AAA",
      orderDate: "2026-10-01T09:00:00.000Z",
      groupNumber: "GRP-AAA",
      buyer: "Ali",
      buyerCode: "B010001",
      seller: "Veli",
      sellerCode: "K010002",
      product: "Model araba",
      productCode: "U010001",
      quantity: 2,
      refundQuantity: 1,
      unitPrice: 1000,
      commissionRate: 10,
      commissionAmount: 200,
      refundableCommissionRate: 10,
      refundableCommissionAmount: 100,
      listingCommissionAmount: null,
      offerCommissionAmount: null,
      priceDifference: null,
      buyerDeduction: 30,
      sellerDeduction: 60,
      refundAmount: 1060.1,
      moneyStatus: "[admin.operations.refunds.moneyStatus.pending]",
      refundedAt: null,
      packageTrackingNo: "SUR-1",
      returnTrackingNo: "SUR-9",
      returnShipmentStatus: "[status.shipment.in_transit]",
      warehouseArrival: null,
      warehouseDecision: null,
      warehouseOutboundAt: null,
      returnToCustomersStatus: null,
      reason: "[status.refundReason.damaged]",
      note: "kutu ezik",
      status: "[status.refundRequest.return_in_transit]",
      completedAt: null,
      returnInvoiceNumber: "TRD2026000000009",
      returnInvoiceStatus: "[admin.finance.invoices.status.sent]",
    });
  });

  it("writes a trade side with its role, warehouse journey and trade status", () => {
    const record = refundExportRecord(
      row({
        origin: "trade",
        status: "returning",
        reason: { code: "fraud_suspected", label: null, note: "depo reddi" },
        warehouse: {
          arrivalStatus: "delivered",
          decision: "rejected",
          outboundAt: "2026-10-07T10:00:00.000Z",
          outboundLabelUrl: null,
          returnToCustomersStatus: "in_transit",
        },
        trade: {
          tradeId: "t1",
          tradeNumber: "TKS-AAA",
          role: "responder",
          counterpartRefundId: "t1:initiator",
        },
      }),
      t,
    );
    expect(record).toMatchObject({
      origin: "[admin.operations.refunds.origin.trade]",
      tradeRole: "[admin.operations.refunds.tradeRole.responder]",
      warehouseArrival: "[status.shipment.delivered]",
      warehouseDecision: "[admin.operations.refunds.warehouseDecision.rejected]",
      warehouseOutboundAt: "2026-10-07T10:00:00.000Z",
      returnToCustomersStatus: "[status.shipment.in_transit]",
      status: "[status.trade.returning]",
      note: "depo reddi",
    });
  });
});

describe("refundReasonText", () => {
  it("a request reason reads the refund reason catalog", () => {
    expect(refundReasonText(row(), t)).toBe("[status.refundReason.damaged]");
  });

  it("a trade reason reads the admin cancel reason catalog; an unknown code is empty", () => {
    expect(
      refundReasonText(
        row({
          origin: "trade",
          reason: { code: "not_a_code", label: null, note: null },
        }),
        t,
      ),
    ).toBe("");
  });

  it("no code → empty (the free text is in the note column)", () => {
    expect(
      refundReasonText(
        row({ reason: { code: null, label: null, note: "x" } }),
        t,
      ),
    ).toBe("");
  });
});

describe("refundExportTotals", () => {
  it("sums refund amounts in cents", () => {
    expect(
      refundExportTotals([
        row(),
        row({ money: { ...row().money, refundAmount: 0.2 } }),
      ]),
    ).toEqual([
      {
        labelKey: "admin.operations.refunds.export.refundTotal",
        value: 1060.3,
        type: "money",
      },
    ]);
  });
});

describe("refundExportFilters", () => {
  it("lists tab, bucket, kind and the date range (never the search term)", () => {
    const filters = refundExportFilters({
      tab: "trade",
      bucket: "refunding",
      kind: "return",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-12",
      search: "Ali",
    });
    expect(filters).toEqual([
      {
        labelKey: "server.export.summary.tab",
        value: "trade",
        valueKey: ADMIN_REFUND_TAB_I18N_KEYS.trade,
      },
      {
        labelKey: "server.export.summary.subTab",
        value: "refunding",
        valueKey: ADMIN_REFUND_BUCKET_I18N_KEYS.refunding,
      },
      {
        labelKey: "admin.operations.refundRequests.kind.label",
        value: "return",
        valueKey: "admin.operations.refundRequests.kind.return",
      },
      { labelKey: "admin.finance.common.startDate", value: "2026-10-01" },
      { labelKey: "admin.finance.common.endDate", value: "2026-10-12" },
    ]);
    expect(JSON.stringify(filters)).not.toContain("Ali");
  });
});

describe("refunds screen catalog keys", () => {
  const hasMessage = (locale: (typeof locales)[number], key: string) =>
    typeof lookupNode(
      getMessages(locale) as unknown as Record<string, unknown>,
      key,
    ) === "string";

  const keys = [
    ...Object.values(ADMIN_REFUND_TAB_I18N_KEYS),
    ...Object.values(ADMIN_REFUND_BUCKET_I18N_KEYS),
    ...Object.values(ADMIN_REFUND_ORIGIN_I18N_KEYS),
    ...Object.values(ADMIN_REFUND_MONEY_STATUS_I18N_KEYS),
    ...Object.values(ADMIN_REFUND_TRADE_ROLE_I18N_KEYS),
    ...Object.values(ADMIN_REFUND_WAREHOUSE_DECISION_I18N_KEYS),
    ...EXPORT_CATALOGS.refundRequests.columns.map((column) => column.labelKey),
    "admin.operations.refunds.export.sheetName",
    "admin.operations.refunds.export.refundTotal",
  ];

  it.each(locales)("every label the screen and the file use exists in %s", (locale) => {
    const missing = keys.filter((key) => !hasMessage(locale, key));
    expect(missing).toEqual([]);
  });
});
