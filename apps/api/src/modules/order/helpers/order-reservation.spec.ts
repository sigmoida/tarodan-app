import { orderReservationState } from "./order-reservation";

/**
 * Ödenmemiş siparişin rezerv durumu — iptal çekirdeği ve yönetici iptal
 * önizlemesi aynı kuralı okur (rezerv mutabakatının "Bulgu D" kuralı).
 */
describe("orderReservationState", () => {
  it("doğrudan satış: rezerv sipariş oluşurken alınır", () => {
    expect(
      orderReservationState({
        reservationReleasedAt: null,
        offerId: null,
        hasPayment: false,
      }),
    ).toBe("held");
  });

  it("teklif siparişi: ödeme hiç başlatılmadıysa rezerv yok, başlatıldıysa var", () => {
    expect(
      orderReservationState({
        reservationReleasedAt: null,
        offerId: "offer-1",
        hasPayment: false,
      }),
    ).toBe("not_reserved");
    expect(
      orderReservationState({
        reservationReleasedAt: null,
        offerId: "offer-1",
        hasPayment: true,
      }),
    ).toBe("held");
  });

  it("süpürme bıraktıysa (her iki tür) zaten bırakılmıştır", () => {
    for (const offerId of [null, "offer-1"]) {
      expect(
        orderReservationState({
          reservationReleasedAt: new Date(),
          offerId,
          hasPayment: true,
        }),
      ).toBe("already_released");
    }
  });
});
