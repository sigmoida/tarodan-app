import { describe, expect, it } from "vitest";
import {
  type AdminOrderLine,
  type AdminOrderListRow,
  type AdminOrderPackage,
  type AdminOrderShipment,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";
import {
  canCancelFileEntry,
  cancelBlockerText,
  cancelShippingNoteKey,
  cancellableRowLine,
  fileEntryCancelEligibility,
  fileEntryVisibleBlocker,
  isCancelRequestReady,
  isNoteMissing,
  orderCancelReasonText,
  pendingCancellationRefund,
} from "./cancel";
import type { OrderFileEntry, OrderFileRefundRequest } from "./fileTypes";

/** Anahtarı (ve parametreleri) döndürür: testte etiketin kaynağı görünür. */
const t = ((key: string, values?: Record<string, unknown>) =>
  values
    ? `[${key}|${JSON.stringify(values)}]`
    : `[${key}]`) as unknown as Translate;

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

describe("fileEntryCancelEligibility (yönetici iptali — API ile ortak kural)", () => {
  it.each(["paid", "preparing"])(
    "%s kalem kargo öncesi ödenmiş iptaldir",
    (status) => {
      expect(fileEntryCancelEligibility(entry({ status }))).toEqual({
        allowed: true,
        kind: "paid_pre_handover",
      });
      expect(canCancelFileEntry(entry({ status }))).toBe(true);
    },
  );

  it("ödeme bekleyen kalem artık iptal edilebilir (para yok türü)", () => {
    expect(
      fileEntryCancelEligibility(entry({ status: "pending_payment" })),
    ).toEqual({ allowed: true, kind: "unpaid" });
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
    ["shipped", "handed_over"],
    ["delivered", "delivered"],
    ["awaiting_buyer_confirmation", "delivered"],
    ["completed", "completed"],
    ["cancelled", "closed"],
    ["refunded", "closed"],
    ["refund_requested", "active_refund"],
  ])("%s kalem iptal edilemez → %s", (status, blocker) => {
    expect(fileEntryCancelEligibility(entry({ status }))).toEqual({
      allowed: false,
      blocker,
    });
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

describe("fileEntryVisibleBlocker + cancelBlockerText", () => {
  it("devir sonrası engelin metnini gösterir", () => {
    const blocker = fileEntryVisibleBlocker(entry({ status: "delivered" }));
    expect(blocker).toBe("delivered");
    expect(cancelBlockerText("delivered", t)).toBe(
      `[admin.operations.orders.cancel.blocked|${JSON.stringify({
        reason: "[admin.operations.orders.cancel.blockers.delivered]",
      })}]`,
    );
  });

  it("uygun, kapanmış ya da yarıda kalmış iptalde ayrı metin yoktur", () => {
    expect(fileEntryVisibleBlocker(entry())).toBeNull();
    expect(fileEntryVisibleBlocker(entry({ status: "cancelled" }))).toBeNull();
    expect(
      fileEntryVisibleBlocker(
        entry({ refundRequests: [refund("pending_review")] }),
      ),
    ).toBeNull();
  });
});

describe("pendingCancellationRefund", () => {
  const open = {
    id: "rr-1",
    status: "pending_review",
  } as OrderFileRefundRequest;

  it("kargo öncesi kalemde açık talep = yarıda kalmış iptal (uyarı + talep linki)", () => {
    const pending = entry({ status: "paid", refundRequests: [open] });
    expect(fileEntryCancelEligibility(pending)).toEqual({
      allowed: false,
      blocker: "pending_cancellation",
    });
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

  it("ödeme bekleyen (sepet ya da teklif) tek kalemli satırda da iptal vardır", () => {
    expect(
      cancellableRowLine(row([pkg([line({ status: "pending_payment" })])]))
        ?.orderId,
    ).toBe("o1");
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

describe("iptal isteği (paylaşılan kural)", () => {
  it("katalog nedeni olmadan gönderilemez", () => {
    expect(isCancelRequestReady({})).toBe(false);
    expect(isCancelRequestReady({ note: "x" })).toBe(false);
  });

  it("'Diğer' dışındaki nedenlerde not isteğe bağlıdır", () => {
    expect(isCancelRequestReady({ reasonCode: "stock_error" })).toBe(true);
    expect(isNoteMissing({ reasonCode: "stock_error" })).toBe(false);
  });

  it("'Diğer' nedeninde boş not alan hatasıdır", () => {
    expect(isCancelRequestReady({ reasonCode: "other", note: "  " })).toBe(
      false,
    );
    expect(isNoteMissing({ reasonCode: "other", note: "  " })).toBe(true);
    expect(isCancelRequestReady({ reasonCode: "other", note: "Ayrıntı" })).toBe(
      true,
    );
  });
});

describe("cancelShippingNoteKey", () => {
  it("kargo iadeye dahilse 'dahil', değilse paketin yine gideceğini söyler", () => {
    expect(
      cancelShippingNoteKey({
        kind: "paid_pre_handover",
        quantity: 1,
        refundAmount: 1180,
        shippingRefunded: true,
      }),
    ).toBe("admin.operations.orders.cancel.shippingIncluded");
    expect(
      cancelShippingNoteKey({
        kind: "paid_pre_handover",
        quantity: 1,
        refundAmount: 1050,
        shippingRefunded: false,
      }),
    ).toBe("admin.operations.orders.cancel.shippingExcluded");
  });
});

describe("orderCancelReasonText", () => {
  it("yönetici iptalinde katalog etiketini gösterir", () => {
    expect(
      orderCancelReasonText(
        {
          cancelledBy: "platform",
          adminCancelReasonCode: "listing_violation",
          cancelReason:
            "Yönetici tarafından iptal edildi: İlan kurallarına aykırılık",
        },
        t,
      ),
    ).toBe("[adminCancel.reasons.listing_violation]");
  });

  it("diğer iptallerde kayıtlı gerekçeye düşer; hiç yoksa null", () => {
    expect(
      orderCancelReasonText(
        {
          cancelledBy: "buyer",
          adminCancelReasonCode: null,
          cancelReason: "Fikrimi değiştirdim",
        },
        t,
      ),
    ).toBe("Fikrimi değiştirdim");
    expect(
      orderCancelReasonText(
        { cancelledBy: null, adminCancelReasonCode: null, cancelReason: null },
        t,
      ),
    ).toBeNull();
  });
});
