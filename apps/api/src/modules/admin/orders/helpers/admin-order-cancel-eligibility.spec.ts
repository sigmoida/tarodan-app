import { OrderStatus, ShipmentStatus } from "@prisma/client";
import {
  ADMIN_CANCEL_NOTE_MAX,
  ADMIN_ORDER_CANCEL_BLOCKERS,
  ADMIN_ORDER_CANCEL_BLOCKER_I18N_KEYS,
  adminCancelRequestProblem,
  adminOrderCancelEligibility,
  normalizeAdminCancelNote,
  preShipmentCancelBlocker,
} from "@tarodan/types";

/**
 * Admin iptali uygunluğu `@tarodan/types`'ta TEK kuraldır (API önizleme,
 * iptal, kilit altı yeniden değerlendirme; panel dosya düğmesi, satır menüsü,
 * teklif ekranı). Kargo öncesi kuralın (`preShipmentCancelBlocker`) üstüne
 * kuruludur; bu spec onu Prisma enum'larının TAMAMINA karşı sabitler — yeni
 * bir sipariş statüsü eklenirse burada bir karar verilmek zorunda kalınır.
 */
describe("adminOrderCancelEligibility", () => {
  const EXPECTED: Record<OrderStatus, string> = {
    [OrderStatus.pending_payment]: "allowed:unpaid",
    [OrderStatus.paid]: "allowed:paid_pre_handover",
    [OrderStatus.preparing]: "allowed:paid_pre_handover",
    [OrderStatus.shipped]: "blocked:handed_over",
    [OrderStatus.delivered]: "blocked:delivered",
    [OrderStatus.awaiting_buyer_confirmation]: "blocked:delivered",
    [OrderStatus.completed]: "blocked:completed",
    [OrderStatus.cancelled]: "blocked:closed",
    [OrderStatus.refunded]: "blocked:closed",
    [OrderStatus.refund_requested]: "blocked:active_refund",
  };

  it.each(Object.values(OrderStatus))("%s (kargo kaydı yok)", (status) => {
    const result = adminOrderCancelEligibility({ status, shipment: null });
    expect(
      result.allowed ? `allowed:${result.kind}` : `blocked:${result.blocker}`,
    ).toBe(EXPECTED[status]);
  });

  it("ödenmiş ama koli taşıyıcıda (hareket ya da shippedAt) → handed_over", () => {
    for (const shipment of [
      { status: ShipmentStatus.picked_up, shippedAt: null },
      { status: ShipmentStatus.label_created, shippedAt: new Date() },
    ]) {
      expect(
        adminOrderCancelEligibility({
          status: OrderStatus.preparing,
          shipment,
        }),
      ).toEqual({ allowed: false, blocker: "handed_over" });
    }
  });

  it("yalnız etiketi oluşmuş koli iptali kapatmaz", () => {
    expect(
      adminOrderCancelEligibility({
        status: OrderStatus.preparing,
        shipment: { status: ShipmentStatus.label_created, shippedAt: null },
      }),
    ).toEqual({ allowed: true, kind: "paid_pre_handover" });
  });

  it("kargo öncesi açık talep = yarıda kalmış iptal", () => {
    expect(
      adminOrderCancelEligibility({
        status: OrderStatus.paid,
        shipment: null,
        hasActiveRefund: true,
      }),
    ).toEqual({ allowed: false, blocker: "pending_cancellation" });
  });

  it("alıcı/escrow kuralı değişmedi: ödenmemiş sipariş orada hâlâ not_paid", () => {
    expect(
      preShipmentCancelBlocker({
        status: OrderStatus.pending_payment,
        shipment: null,
      }),
    ).toBe("not_paid");
  });

  it("her engelin panel metni vardır", () => {
    for (const blocker of ADMIN_ORDER_CANCEL_BLOCKERS) {
      expect(ADMIN_ORDER_CANCEL_BLOCKER_I18N_KEYS[blocker]).toMatch(
        /^admin\.operations\.orders\.cancel\.blockers\./,
      );
    }
  });
});

describe("adminCancelRequestProblem", () => {
  it("katalog dışı ya da eksik neden", () => {
    expect(adminCancelRequestProblem(undefined)).toBe("reason_missing");
    expect(adminCancelRequestProblem({})).toBe("reason_missing");
    expect(adminCancelRequestProblem({ reasonCode: "nope" as never })).toBe(
      "reason_missing",
    );
  });

  it("'Diğer' iç not ister; boşluk not sayılmaz", () => {
    expect(adminCancelRequestProblem({ reasonCode: "other" })).toBe(
      "note_required",
    );
    expect(adminCancelRequestProblem({ reasonCode: "other", note: " " })).toBe(
      "note_required",
    );
    expect(
      adminCancelRequestProblem({ reasonCode: "other", note: "Ayrıntı" }),
    ).toBeNull();
  });

  it("not üst sınırı", () => {
    expect(
      adminCancelRequestProblem({
        reasonCode: "stock_error",
        note: "a".repeat(ADMIN_CANCEL_NOTE_MAX + 1),
      }),
    ).toBe("note_too_long");
    expect(
      adminCancelRequestProblem({
        reasonCode: "stock_error",
        note: "a".repeat(ADMIN_CANCEL_NOTE_MAX),
      }),
    ).toBeNull();
  });

  it("notun saklanan hâli kırpılmıştır; boşsa null", () => {
    expect(normalizeAdminCancelNote("  x  ")).toBe("x");
    expect(normalizeAdminCancelNote("   ")).toBeNull();
    expect(normalizeAdminCancelNote(undefined)).toBeNull();
  });
});
