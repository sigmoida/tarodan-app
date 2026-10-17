import type { AdminCancellationRow } from "@tarodan/types";
import {
  cancellationExportFilters,
  cancellationExportRecords,
  cancellationExportTotals,
  cancellationReasonText,
} from "./cancellation-export";

/** Anahtarı olduğu gibi döndüren çevirmen: testte etiketin kaynağı görünür. */
const t = (key: string) => `[${key}]`;

const party = (id: string, code: string | null = `K-${id}`) => ({
  id,
  displayName: `name-${id}`,
  email: `${id}@x.com`,
  code,
  isGuest: false,
});

function row(
  overrides: Partial<AdminCancellationRow> = {},
): AdminCancellationRow {
  return {
    kind: "group",
    id: "g1",
    number: "GRP-1",
    origin: "direct_sale",
    createdAt: "2026-09-20T09:00:00.000Z",
    status: "cancelled",
    detailOrderId: "o1",
    tradeId: null,
    isTest: false,
    buyer: party("b1"),
    sellers: [party("s1")],
    totalAmount: 240,
    subtotal: 200,
    fees: { salesCommission: 20, platformFee: 5 },
    offer: null,
    lineCounts: { cancelled: 2, total: 2 },
    cancelledAt: "2026-09-21T10:00:00.000Z",
    packages: [
      {
        key: "p1",
        packageNumber: "PKG-1",
        seller: party("s1"),
        shipment: null,
        invoices: [],
        lines: ["o1", "o2"].map((orderId, i) => ({
          orderId,
          orderNumber: `ORD-${i + 1}`,
          status: "cancelled" as const,
          cancellationType: "iptal",
          cancelledBy: "buyer" as const,
          quantity: 1,
          unitPrice: 100,
          subtotal: 100,
          totalAmount: 120,
          preparingDeadline: null,
          preparingExtendedAt: null,
          deliveredAt: null,
          hasActiveRefund: false,
          product: {
            id: `p-${orderId}`,
            title: `title-${orderId}`,
            productCode: `U-${orderId}`,
            modelCode: null,
            brandName: null,
            imageUrl: null,
          },
        })),
      },
    ],
    cancellations: {
      o1: {
        cancelledAt: "2026-09-21T10:00:00.000Z",
        cancelledBy: "buyer",
        reason: { kind: "code", code: "changed_mind" },
        refundState: "refunded",
      },
      o2: {
        cancelledAt: null,
        cancelledBy: null,
        reason: { kind: "expired" },
        refundState: "not_charged",
      },
    },
    ...overrides,
  };
}

describe("cancellation export", () => {
  it("writes one row per cancelled LINE (long format)", () => {
    expect(cancellationExportRecords(row(), t)).toHaveLength(2);
  });

  it("repeats the parent record's columns on every line", () => {
    const [first, second] = cancellationExportRecords(row(), t);
    for (const line of [first, second]) {
      expect(line).toMatchObject({
        rowNumber: "GRP-1",
        testLane: false,
        origin:
          "[admin.operations.cancellations.export.originValue.direct_sale]",
        orderDate: "2026-09-20T09:00:00.000Z",
        buyer: "name-b1",
        buyerCode: "K-b1",
      });
    }
    expect(first.orderNumber).toBe("ORD-1");
    expect(second.orderNumber).toBe("ORD-2");
  });

  it("reason text uses the same catalog keys as the screen", () => {
    const { cancellations } = row();
    expect(cancellationReasonText(cancellations.o1, t)).toBe(
      "[status.orderCancellationReason.changed_mind]",
    );
    expect(cancellationReasonText(cancellations.o2, t)).toBe(
      "[admin.operations.cancellations.reason.expired]",
    );
    expect(
      cancellationReasonText(
        {
          cancelledAt: null,
          cancelledBy: "platform",
          reason: { kind: "text", text: "Stok tükendi" },
          refundState: "pending",
        },
        t,
      ),
    ).toBe("Stok tükendi");
    expect(
      cancellationReasonText(
        {
          cancelledAt: null,
          cancelledBy: null,
          reason: { kind: "none" },
          refundState: "pending",
        },
        t,
      ),
    ).toBe("—");
  });

  it("keeps amounts numeric and labels actors / refund states from the catalog", () => {
    const [first, second] = cancellationExportRecords(row(), t);
    expect(first).toMatchObject({
      quantity: 1,
      unitPrice: 100,
      subtotal: 100,
      cancelledAt: "2026-09-21T10:00:00.000Z",
      cancelledBy: "[admin.operations.cancellations.actor.buyer]",
      refundState: "[admin.operations.cancellations.refundState.refunded]",
    });
    expect(second.cancelledBy).toBe(
      "[admin.operations.cancellations.actor.unknown]",
    );
    expect(second.cancelledAt).toBeNull();
  });

  /** Test şeridi kaydı dökümden çıkarılmaz — işaretlenir (liste gibi). */
  it("marks test-lane records instead of dropping them", () => {
    const lines = cancellationExportRecords(
      row({ id: "g2", number: "GRP-2", isTest: true }),
      t,
    );
    expect(lines.every((line) => line.testLane === true)).toBe(true);
  });

  it("still writes a record that has no lines (the count must hold)", () => {
    expect(cancellationExportRecords(row({ packages: [] }), t)).toEqual([
      expect.objectContaining({ rowNumber: "GRP-1" }),
    ]);
  });

  it("puts the parent totals in the summary, never in the data rows", () => {
    expect(
      cancellationExportTotals([row(), row({ id: "g2", totalAmount: 60.1 })]),
    ).toEqual([
      {
        labelKey: "server.export.summary.parentTotal",
        value: 300.1,
        type: "money",
      },
    ]);
  });

  it("summarises tab, sub-tab and filters; the party term is redacted", () => {
    const entries = cancellationExportFilters({
      tab: "offer",
      bucket: "buyer",
      party: "ahmet@ornek.com",
      adminReason: "any",
    });
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labelKey: "server.export.summary.tab",
          valueKey: "admin.operations.cancellations.tabs.offers",
        }),
        expect.objectContaining({
          labelKey: "server.export.summary.subTab",
          valueKey: "admin.operations.cancellations.buckets.buyer",
        }),
        expect.objectContaining({
          labelKey: "admin.operations.cancellations.filters.party",
          redacted: true,
        }),
        expect.objectContaining({
          labelKey: "admin.operations.cancellations.filters.adminReason",
          valueKey: "admin.operations.cancellations.filters.adminReasonAny",
        }),
      ]),
    );
  });

  it("falls back to the default tab for an unknown one", () => {
    const [tab] = cancellationExportFilters({ tab: "nope" });
    expect(tab).toMatchObject({ value: "all" });
  });
});
