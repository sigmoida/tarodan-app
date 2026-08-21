import { isSuratReturnCompleted } from "./surat-status.mapper";

/**
 * Bu testlerin girdisi uydurma değil: `PKG-56HMSK9TX5` gönderisinin Sürat'tan
 * dönen gerçek cevabı. Eski sürüm yalnız kod 12'ye baktığı için o iadeyi hiç
 * tamamlanmış saymadı ve sipariş "iade sürecinde" takılı kaldı.
 */
describe("isSuratReturnCompleted", () => {
  const live = {
    KargonunDurumuSayi: 13,
    KargonunDurumu: "Teslim Edildi (İade)",
    IadeDurum: "Evet",
    Hareketler: [
      { Islem: "İade Edildi" },
      { Islem: "Kargo Araçtan İndirildi" },
      { Islem: "Kargo İade Sürecinde" },
      { Islem: "Teslim Edildi" },
    ],
  };

  it("accepts the documented code 12 on its own", () => {
    expect(
      isSuratReturnCompleted({ KargonunDurumuSayi: 12, IadeDurum: "Hayır" }),
    ).toBe(true);
  });

  it("accepts the live shape the docs do not describe", () => {
    expect(isSuratReturnCompleted(live)).toBe(true);
  });

  it("accepts it from the movement alone when the status text is unfamiliar", () => {
    // SOAP ve REST aynı hareket için farklı metinler döndürebiliyor; durum
    // metnine tek başına bağlanmıyoruz.
    expect(
      isSuratReturnCompleted({ ...live, KargonunDurumu: "Baska Bir Metin" }),
    ).toBe(true);
  });

  it("does NOT treat code 13 alone as completed", () => {
    // Doküman 13'e "İade Gönderi Yolda" diyor. Açık tamamlanma sinyali yoksa
    // beklemek doğrusu: erken kabul, satıcı ürünü almadan para iade ettirir.
    expect(
      isSuratReturnCompleted({
        KargonunDurumuSayi: 13,
        KargonunDurumu: "İade Gönderi Yolda",
        IadeDurum: "Evet",
        Hareketler: [{ Islem: "Kargo İade Sürecinde" }],
      }),
    ).toBe(false);
  });

  it("ignores return signals when the carrier says it is not a return", () => {
    expect(
      isSuratReturnCompleted({
        KargonunDurumuSayi: 6,
        KargonunDurumu: "Teslim Edildi",
        IadeDurum: "Hayır",
        Hareketler: [{ Islem: "Teslim Edildi" }],
      }),
    ).toBe(false);
  });

  it("survives missing optional fields", () => {
    expect(isSuratReturnCompleted({ KargonunDurumuSayi: 6 })).toBe(false);
    expect(
      isSuratReturnCompleted({ KargonunDurumuSayi: 13, IadeDurum: "Evet" }),
    ).toBe(false);
  });
});
