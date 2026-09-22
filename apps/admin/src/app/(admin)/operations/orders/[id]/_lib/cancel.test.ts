import { describe, expect, it } from "vitest";
import type {
  AdminOrderLine,
  AdminOrderListRow,
  AdminOrderPackage,
  AdminOrderShipment,
} from "@tarodan/types";
import {
  CANCEL_REASON_MAX_LENGTH,
  canCancelFileEntry,
  cancelShippingNoteKey,
  cancellableRowLine,
  fileEntryCancelBlocker,
  isValidCancelReason,
  pendingCancellationRefund,
} from "./cancel";
import type { OrderFileEntry, OrderFileRefundRequest } from "./fileTypes";

const entry = (overrides: Partial<OrderFileEntry> = {}) =>
  ({
    id: "o1",
    orderNumber: "ORD-1",
    status: "paid",
    shipment: null,
    refundRequests: [],
    ...overrides,
  }) as OrderFileEntry;

const refund = (status: string) => ({ status }) as OrderFileRefundRequest;

describe("canCancelFileEntry", () => {
  it.each(["paid", "preparing"])("%s kalem iptal edilebilir", (status) => {
    expect(canCancelFileEntry(entry({ status }))).toBe(true);
  });

  it("yalnız etiketi oluşmuş kargo iptali kapatmaz", () => {
    expect(
      canCancelFileEntry(
        entry({
          status: "preparing",
          shipment: { status: "label_created", shippedAt: null },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    "pending_payment",
    "shipped",
    "delivered",
    "awaiting_buyer_confirmation",
    "completed",
    "cancelled",
    "refunded",
    "refund_requested",
  ])("%s kalem iptal edilemez", (status) => {
    expect(canCancelFileEntry(entry({ status }))).toBe(false);
  });

  it("koli taşıyıcıya geçtiyse (hareket ya da shippedAt) iptal kapanır", () => {
    expect(
      canCancelFileEntry(
        entry({
          status: "preparing",
          shipment: { status: "picked_up", shippedAt: null },
        }),
      ),
    ).toBe(false);
    expect(
      canCancelFileEntry(
        entry({
          status: "paid",
          shipment: {
            status: "label_created",
            shippedAt: "2026-09-21T09:00:00.000Z",
          },
        }),
      ),
    ).toBe(false);
  });

  it("açık iade talebi varken iptal kapanır; kapanmış talep engellemez", () => {
    expect(
      canCancelFileEntry(entry({ refundRequests: [refund("pending_review")] })),
    ).toBe(false);
    expect(
      canCancelFileEntry(entry({ refundRequests: [refund("rejected")] })),
    ).toBe(true);
  });
});

describe("pendingCancellationRefund", () => {
  const open = {
    id: "rr-1",
    status: "pending_review",
  } as OrderFileRefundRequest;

  it("kargo öncesi kalemde açık talep = yarıda kalmış iptal (uyarı + talep linki)", () => {
    const pending = entry({ status: "paid", refundRequests: [open] });
    expect(fileEntryCancelBlocker(pending)).toBe("pending_cancellation");
    expect(pendingCancellationRefund(pending)?.id).toBe("rr-1");
  });

  it("açık talep yoksa ya da kalem kargodaysa uyarı yoktur", () => {
    expect(pendingCancellationRefund(entry())).toBeNull();
    expect(
      pendingCancellationRefund(
        entry({ status: "shipped", refundRequests: [open] }),
      ),
    ).toBeNull();
    expect(
      pendingCancellationRefund(
        entry({ refundRequests: [refund("refunded")] }),
      ),
    ).toBeNull();
  });
});

describe("cancellableRowLine", () => {
  const line = (overrides: Partial<AdminOrderLine> = {}) =>
    ({
      orderId: "o1",
      orderNumber: "ORD-1",
      status: "paid",
      hasActiveRefund: false,
      ...overrides,
    }) as AdminOrderLine;
  const pkg = (
    lines: AdminOrderLine[],
    shipment: AdminOrderShipment | null = null,
  ) => ({ lines, shipment }) as AdminOrderPackage;
  const row = (packages: AdminOrderPackage[]) =>
    ({ kind: "order", id: "o1", packages }) as AdminOrderListRow;
  const shipment = (
    status: AdminOrderShipment["status"],
    shippedAt: string | null = null,
  ): AdminOrderShipment => ({
    provider: "surat",
    trackingNumber: null,
    status,
    shippedAt,
  });

  it("tek kalemli uygun satırda kalemi döner", () => {
    expect(cancellableRowLine(row([pkg([line()])]))?.orderId).toBe("o1");
  });

  it("çok kalemli sepette menüde iptal yoktur (dosyada kalem seçilir)", () => {
    expect(
      cancellableRowLine(
        row([pkg([line(), line({ orderId: "o2", orderNumber: "ORD-2" })])]),
      ),
    ).toBeNull();
  });

  it("paketin kargosu taşıyıcıdaysa iptal yoktur", () => {
    expect(
      cancellableRowLine(row([pkg([line()], shipment("in_transit"))])),
    ).toBeNull();
    expect(
      cancellableRowLine(
        row([
          pkg(
            [line({ status: "preparing" })],
            shipment("label_created", "2026-09-21T09:00:00.000Z"),
          ),
        ]),
      ),
    ).toBeNull();
    expect(
      cancellableRowLine(
        row([pkg([line({ status: "preparing" })], shipment("label_created"))]),
      )?.orderId,
    ).toBe("o1");
  });

  it("açık iadeli ya da kargolanmış kalemde iptal yoktur", () => {
    expect(
      cancellableRowLine(row([pkg([line({ hasActiveRefund: true })])])),
    ).toBeNull();
    expect(
      cancellableRowLine(row([pkg([line({ status: "shipped" })])])),
    ).toBeNull();
  });
});

describe("isValidCancelReason", () => {
  it("boş ya da yalnız boşluktan oluşan gerekçeyi reddeder", () => {
    expect(isValidCancelReason("")).toBe(false);
    expect(isValidCancelReason("   \n ")).toBe(false);
  });

  it("dolu gerekçeyi kabul eder", () => {
    expect(isValidCancelReason("  Satıcı stoğu bitti ")).toBe(true);
  });

  it("API sınırını aşan gerekçeyi reddeder", () => {
    expect(isValidCancelReason("a".repeat(CANCEL_REASON_MAX_LENGTH))).toBe(
      true,
    );
    expect(isValidCancelReason("a".repeat(CANCEL_REASON_MAX_LENGTH + 1))).toBe(
      false,
    );
  });
});

describe("cancelShippingNoteKey", () => {
  it("kargo iadeye dahilse 'dahil', değilse paketin yine gideceğini söyler", () => {
    expect(
      cancelShippingNoteKey({ refundAmount: 1180, shippingRefunded: true }),
    ).toBe("admin.operations.orders.cancel.shippingIncluded");
    expect(
      cancelShippingNoteKey({ refundAmount: 1050, shippingRefunded: false }),
    ).toBe("admin.operations.orders.cancel.shippingExcluded");
  });
});
