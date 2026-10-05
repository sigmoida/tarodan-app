import { orderBuyerContact } from "./order-buyer-contact";

/**
 * Regresyon: misafir siparişinde alıcı e-postası kullanıcı kaydından
 * (ortak sistem hesabı) okunuyordu; iptal/iade/gecikme e-postaları
 * `guest@tarodan.system`'a gidiyor, misafire hiç ulaşmıyordu.
 */
describe("orderBuyerContact", () => {
  const guestAccount = {
    email: "guest@tarodan.system",
    displayName: "GUEST_SYSTEM",
  };

  it("member order: the account's address and name", () => {
    expect(
      orderBuyerContact({
        buyer: { email: "uye@example.com", displayName: "Üye" },
        shippingAddress: { fullName: "Teslimat Adı" },
      }),
    ).toEqual({ email: "uye@example.com", name: "Üye", isGuest: false });
  });

  it("guest order: the real guest from the shipping data, never the system account", () => {
    expect(
      orderBuyerContact({
        buyer: guestAccount,
        shippingAddress: {
          isGuestOrder: true,
          guestEmail: "misafir@example.com",
          guestName: "Misafir Alıcı",
        },
      }),
    ).toEqual({
      email: "misafir@example.com",
      name: "Misafir Alıcı",
      isGuest: true,
    });
  });

  it("recognises a guest by the system account even without the flag (old rows)", () => {
    expect(
      orderBuyerContact({
        buyer: guestAccount,
        shippingAddress: { email: "eski@example.com", fullName: "Eski Kayıt" },
      }),
    ).toEqual({ email: "eski@example.com", name: "Eski Kayıt", isGuest: true });
  });

  it("sends nothing when a guest has no reachable address", () => {
    expect(
      orderBuyerContact({
        buyer: guestAccount,
        shippingAddress: { isGuestOrder: true, guestName: "GUEST_SYSTEM" },
      }),
    ).toEqual({ email: null, name: "", isGuest: true });
    expect(
      orderBuyerContact({
        buyer: guestAccount,
        shippingAddress: {
          isGuestOrder: true,
          guestEmail: "guest@tarodan.system",
        },
      }).email,
    ).toBeNull();
  });
});
