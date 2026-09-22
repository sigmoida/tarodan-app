import {
  ORDER_CANCEL_REASON,
  ORDER_EXPIRY_CANCEL_REASONS,
  isOrderExpiryCancelReason,
} from "./order-cancel-reasons";

describe("order cancel reasons", () => {
  it('treats the payment window and the shipping deadline as "Süresi Dolan"', () => {
    expect([...ORDER_EXPIRY_CANCEL_REASONS].sort()).toEqual(
      [
        ORDER_CANCEL_REASON.paymentWindowExpired,
        ORDER_CANCEL_REASON.sellerShipDeadlineExpired,
      ].sort(),
    );
    expect(
      isOrderExpiryCancelReason(ORDER_CANCEL_REASON.paymentWindowExpired),
    ).toBe(true);
    expect(
      isOrderExpiryCancelReason(ORDER_CANCEL_REASON.sellerShipDeadlineExpired),
    ).toBe(true);
  });

  it("does not call other system cancellations an expiry", () => {
    for (const reason of [
      ORDER_CANCEL_REASON.stockDepleted,
      ORDER_CANCEL_REASON.stockReservedForTrade,
      ORDER_CANCEL_REASON.oversoldAfterPayment,
      ORDER_CANCEL_REASON.replacedByNewCheckout,
      ORDER_CANCEL_REASON.buyerCancelled,
      "Ürünü artık istemiyorum",
    ]) {
      expect(isOrderExpiryCancelReason(reason)).toBe(false);
    }
    expect(isOrderExpiryCancelReason(null)).toBe(false);
    expect(isOrderExpiryCancelReason(undefined)).toBe(false);
  });

  /**
   * Historical rows were written with these exact literals and the
   * cancellation-actor backfill matches them verbatim. Rewording a constant
   * would silently split old and new rows into two "reasons".
   */
  it("keeps the literals historical rows were written with", () => {
    expect(ORDER_CANCEL_REASON).toEqual({
      buyerCancelled: "Alıcı tarafından iptal edildi",
      paymentWindowExpired: "Ödeme süresi (24 saat) doldu",
      sellerShipDeadlineExpired:
        "Satıcı belirlenen süre içinde kargoya vermediği için otomatik iptal edildi",
      oversoldAfterPayment:
        "Stok tükendi: ödeme sonrası mevcut stok sipariş adedini karşılamadı",
      stockDepleted: "Stok tükendi",
      stockReservedForTrade: "Stok takas icin ayrildi",
      replacedByNewCheckout: "Yeni toplu sipariş ile değiştirildi",
    });
  });
});
