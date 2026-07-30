import { resolveGuestInvoiceRecipient } from "./elogo-guest-recipient";

/**
 * HIGH: tüm misafir siparişleri tek sistem kullanıcısını (guest@tarodan.system)
 * paylaşıyor. `resolveRecipient` alıcı bilgisini KULLANICI kaydından okuduğu için
 * misafirin hizmet bedeli / platform satışı e-Arşivi "GUEST_SYSTEM" adına,
 * VKN 11111111111 ve adres "Belirtilmemiş" ile kesiliyor; zorunlu e-Arşiv kopyası
 * da gerçek müşteriye değil sistem adresine "gönderiliyor". Gerçek ad/adres/e-posta
 * `order.shippingAddress` JSON'unda mevcut — nihai tüketici yolu bile gerçek ad
 * gerektirir.
 */
describe("resolveGuestInvoiceRecipient", () => {
  const shippingAddress = {
    guestName: "Ahmet Yılmaz",
    guestEmail: "ahmet@example.com",
    guestPhone: "5551112233",
    fullName: "Ahmet Yılmaz",
    phone: "5551112233",
    city: "İstanbul",
    district: "Kadıköy",
    address: "Örnek Mah. 1",
    zipCode: "34000",
  };

  it("gerçek ad, e-posta ve adres siparişten alınır", () => {
    const recipient = resolveGuestInvoiceRecipient(shippingAddress);

    expect(recipient).not.toBeNull();
    expect(recipient!.name).toBe("Ahmet Yılmaz");
    expect(recipient!.email).toBe("ahmet@example.com");
    expect(recipient!.address).toMatchObject({
      city: "İstanbul",
      district: "Kadıköy",
    });
  });

  it("guestName yoksa teslimat adındaki isim kullanılır", () => {
    const recipient = resolveGuestInvoiceRecipient({
      ...shippingAddress,
      guestName: undefined,
    });

    expect(recipient!.name).toBe("Ahmet Yılmaz");
  });

  it("sistem e-posta adresi ASLA fatura alıcısı olamaz", () => {
    const recipient = resolveGuestInvoiceRecipient({
      ...shippingAddress,
      guestEmail: "guest@tarodan.system",
    });

    expect(recipient!.email).toBeUndefined();
  });

  it("kullanılabilir ad yoksa null döner (çağıran mevcut davranışa düşer)", () => {
    expect(
      resolveGuestInvoiceRecipient({ city: "İstanbul" } as any),
    ).toBeNull();
    expect(resolveGuestInvoiceRecipient(null)).toBeNull();
    expect(resolveGuestInvoiceRecipient("not-an-object" as any)).toBeNull();
  });

  it("GUEST_SYSTEM yer tutucusu ad olarak kabul edilmez", () => {
    expect(
      resolveGuestInvoiceRecipient({
        ...shippingAddress,
        guestName: "GUEST_SYSTEM",
        fullName: "GUEST_SYSTEM",
      }),
    ).toBeNull();
  });
});
