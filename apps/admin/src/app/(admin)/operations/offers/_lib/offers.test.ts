import { describe, expect, it } from "vitest";
import {
  canCancelOffer,
  linkedOrderCancelEligibility,
  offerCancelAction,
  type OfferLinkedOrder,
  type OfferStatus,
} from "./offers";

const order = (
  overrides: Partial<OfferLinkedOrder> = {},
): OfferLinkedOrder => ({
  id: "o1",
  orderNumber: "ORD-1",
  status: "pending_payment",
  totalAmount: 700,
  createdAt: "2026-10-01T10:00:00.000Z",
  shipment: null,
  hasActiveRefund: false,
  ...overrides,
});

const offer = (
  status: OfferStatus,
  linked: OfferLinkedOrder | null = null,
) => ({ status, order: linked });

describe("offerCancelAction — teklif ekranının tek iptal kararı", () => {
  it("siparişsiz bekleyen teklif → teklif iptali", () => {
    expect(offerCancelAction(offer("pending"))).toEqual({ kind: "offer" });
  });

  it("ödeme bekleyen teklif siparişi → sipariş iptali (sepet siparişiyle aynı diyalog)", () => {
    const linked = order();
    expect(offerCancelAction(offer("accepted", linked))).toEqual({
      kind: "order",
      order: linked,
    });
  });

  it("kargo öncesi ödenmiş teklif siparişi → sipariş iptali", () => {
    const linked = order({ status: "preparing" });
    expect(offerCancelAction(offer("accepted", linked))?.kind).toBe("order");
  });

  it("siparişi iptal edilmiş anlaşma → teklif iptali (sipariş yeniden iptal edilmez)", () => {
    expect(
      offerCancelAction(offer("accepted", order({ status: "cancelled" }))),
    ).toEqual({ kind: "offer" });
  });

  it.each([
    ["kargoda", order({ status: "shipped" })],
    ["teslim edilmiş", order({ status: "delivered" })],
    ["tamamlanmış", order({ status: "completed" })],
    [
      "koli taşıyıcıda",
      order({
        status: "preparing",
        shipment: { status: "picked_up", shippedAt: null },
      }),
    ],
    ["açık iade talebi", order({ status: "paid", hasActiveRefund: true })],
  ])("%s sipariş → işlem yok", (_, linked) => {
    expect(offerCancelAction(offer("accepted", linked))).toBeNull();
  });

  it("reddedilmiş / süresi dolmuş teklif → işlem yok", () => {
    expect(offerCancelAction(offer("rejected"))).toBeNull();
    expect(offerCancelAction(offer("expired"))).toBeNull();
  });
});

describe("canCancelOffer — yalnız canlı siparişi OLMAYAN teklif", () => {
  it("ödeme bekleyen siparişi olan teklif teklif iptaliyle kapanmaz", () => {
    expect(canCancelOffer(offer("accepted", order()))).toBe(false);
  });

  it("siparişsiz ya da siparişi iptal edilmiş teklif kapanır", () => {
    expect(canCancelOffer(offer("pending"))).toBe(true);
    expect(
      canCancelOffer(offer("accepted", order({ status: "cancelled" }))),
    ).toBe(true);
  });
});

describe("linkedOrderCancelEligibility", () => {
  it("canlı sipariş yoksa null; varsa ortak kuralın sonucu", () => {
    expect(linkedOrderCancelEligibility({ order: null })).toBeNull();
    expect(
      linkedOrderCancelEligibility({ order: order({ status: "cancelled" }) }),
    ).toBeNull();
    expect(
      linkedOrderCancelEligibility({ order: order({ status: "delivered" }) }),
    ).toEqual({ allowed: false, blocker: "delivered" });
    expect(linkedOrderCancelEligibility({ order: order() })).toEqual({
      allowed: true,
      kind: "unpaid",
    });
  });
});
