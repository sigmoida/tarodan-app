import type { AdminCancellationRow } from "@tarodan/types";
import {
  cancellationExportSheet,
  cancellationReasonText,
  flattenCancellationRows,
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
  it("writes one sheet row per cancelled LINE", () => {
    expect(flattenCancellationRows([row(), row({ id: "g2" })])).toHaveLength(4);
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

  it("renders translated headers, numbers as numbers and the unknown actor label", () => {
    const sheet = cancellationExportSheet([row()], t);
    expect(sheet.name).toBe(
      "[admin.operations.cancellations.export.sheetName]",
    );
    expect(sheet.headers[0]).toBe(
      "[admin.operations.cancellations.export.rowNumber]",
    );
    expect(sheet.rows).toHaveLength(2);

    const col = (name: string) =>
      sheet.headers.indexOf(`[admin.operations.cancellations.export.${name}]`);
    const [first, second] = sheet.rows;
    expect(first[col("rowNumber")]).toBe("GRP-1");
    expect(first[col("origin")]).toBe(
      "[admin.operations.cancellations.export.originValue.direct_sale]",
    );
    expect(first[col("orderNumber")]).toBe("ORD-1");
    expect(first[col("unitPrice")]).toBe(100);
    expect(first[col("cancelledBy")]).toBe(
      "[admin.operations.cancellations.actor.buyer]",
    );
    expect(first[col("refundState")]).toBe(
      "[admin.operations.cancellations.refundState.refunded]",
    );
    expect(second[col("cancelledBy")]).toBe(
      "[admin.operations.cancellations.actor.unknown]",
    );
    expect(second[col("cancelledAt")]).toBe("");
  });
});
