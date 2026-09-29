import { OrderStatus } from "@prisma/client";
import { groupOrderRefundLimit } from "./group-refund-limit";

/**
 * Sepet: aynı koliden A (kargo payı 130 onda: 1000 + 130 = 1130) ve B (500).
 * Ödeme 1630.
 */
describe("groupOrderRefundLimit", () => {
  const A = (overrides: Record<string, unknown> = {}) => ({
    id: "a",
    status: OrderStatus.cancelled as OrderStatus,
    totalAmount: 1130,
    buyerShippingAmount: 130,
    serviceVatRate: 0,
    ...overrides,
  });
  const B = (overrides: Record<string, unknown> = {}) => ({
    id: "b",
    status: OrderStatus.cancelled as OrderStatus,
    totalAmount: 500,
    buyerShippingAmount: 0,
    serviceVatRate: 0,
    ...overrides,
  });

  it("son canlı kardeş: pay + kardeşte tutulmuş koli kargosu", () => {
    expect(
      groupOrderRefundLimit({
        orderTotal: 500,
        paymentAmount: 1630,
        refundedOrders: { a: 1000 },
        packageSiblings: [A()],
      }),
    ).toBe(630);
  });

  it("kargo KDV'si satırın oranıyla brüte çıkar", () => {
    expect(
      groupOrderRefundLimit({
        orderTotal: 500,
        paymentAmount: 1656,
        refundedOrders: { a: 1000 },
        packageSiblings: [A({ serviceVatRate: 20, totalAmount: 1156 })],
      }),
    ).toBe(656);
  });

  it("kardeş hâlâ gidecekse kargo eklenmez (koli yine yola çıkar)", () => {
    for (const status of [
      OrderStatus.paid,
      OrderStatus.preparing,
      OrderStatus.shipped,
      OrderStatus.refund_requested,
    ]) {
      expect(
        groupOrderRefundLimit({
          orderTotal: 500,
          paymentAmount: 1630,
          refundedOrders: {},
          packageSiblings: [A({ status })],
        }),
      ).toBe(500);
    }
  });

  it("kargo payını taşıyan ilk kalem kendi tutarıyla sınırlıdır", () => {
    expect(
      groupOrderRefundLimit({
        orderTotal: 1130,
        paymentAmount: 1630,
        refundedOrders: { b: 500 },
        packageSiblings: [B()],
      }),
    ).toBe(1130);
  });

  it("çift sayım yok: kargo kardeşle birlikte iade edildiyse eklenmez", () => {
    expect(
      groupOrderRefundLimit({
        orderTotal: 500,
        paymentAmount: 1630,
        refundedOrders: { a: 1130 },
        packageSiblings: [A()],
      }),
    ).toBe(500);
  });

  it("çift sayım yok: kargoyu önceki bir kardeş (payını aşarak) almışsa eklenmez", () => {
    // Üç kalem: A (kargo), B, C. B son canlıyken kargoyla iade edildi (630);
    // A hâlâ kargoyu iade edilmemiş gösterse bile C'ye tekrar eklenmez.
    expect(
      groupOrderRefundLimit({
        orderTotal: 200,
        paymentAmount: 1830,
        refundedOrders: { a: 1000, b: 630 },
        packageSiblings: [A(), B()],
      }),
    ).toBe(200);
  });

  it("ödemede kalan iade edilebilir tutarla sınırlıdır", () => {
    expect(
      groupOrderRefundLimit({
        orderTotal: 500,
        paymentAmount: 1630,
        // Diğer paketlerden/kalemlerden 1100 iade edilmiş: kalan 530.
        refundedOrders: { a: 1000, other: 100 },
        packageSiblings: [A()],
      }),
    ).toBe(530);
  });

  it("paketsiz / tek kalemli siparişte tavan sipariş payıdır", () => {
    expect(
      groupOrderRefundLimit({
        orderTotal: 500,
        paymentAmount: 1630,
        refundedOrders: {},
        packageSiblings: [],
      }),
    ).toBe(500);
  });
});
