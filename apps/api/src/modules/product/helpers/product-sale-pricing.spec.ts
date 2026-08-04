import { resolveCreateSalePricing } from "./product-sale-pricing";

/**
 * Fiyat modeli (A + oldPrice): `price` HER ZAMAN güncel satış fiyatıdır,
 * `oldPrice` ise indirim öncesi (çizili) fiyattır. İndirim yoksa `oldPrice` null'dır.
 *
 * Bu kural güncelleme yolunda vardı ama oluşturma yolunda yoktu: yeni ilan
 * formunda indirim bölümü olmadığı için satıcı ilanı indirimli açamıyor, açtıktan
 * sonra düzenleme ekranına girmek zorunda kalıyordu.
 */
describe("resolveCreateSalePricing", () => {
  it("indirim yoksa fiyat aynen kalır", () => {
    expect(resolveCreateSalePricing({ price: 100 })).toEqual({
      price: 100,
      oldPrice: null,
      saleStartDate: null,
      saleEndDate: null,
    });
  });

  it("indirimde price indirimli, oldPrice indirim öncesi olur", () => {
    expect(
      resolveCreateSalePricing({ price: 100, salePrice: 80 }),
    ).toMatchObject({ price: 80, oldPrice: 100 });
  });

  it("indirim öncesi fiyat ayrıca verilebilir", () => {
    expect(
      resolveCreateSalePricing({
        price: 100,
        originalPrice: 120,
        salePrice: 80,
      }),
    ).toMatchObject({ price: 80, oldPrice: 120 });
  });

  it("indirim öncesi fiyat, girilen fiyattan küçük olamaz", () => {
    // Aksi halde ürün "indirimli" görünürken çizili fiyat daha düşük çıkardı.
    expect(
      resolveCreateSalePricing({
        price: 100,
        originalPrice: 90,
        salePrice: 80,
      }),
    ).toMatchObject({ price: 80, oldPrice: 100 });
  });

  it("indirimli fiyat fiyata eşit veya büyükse indirim uygulanmaz", () => {
    expect(
      resolveCreateSalePricing({ price: 100, salePrice: 100 }),
    ).toMatchObject({ price: 100, oldPrice: null });
    expect(
      resolveCreateSalePricing({ price: 100, salePrice: 150 }),
    ).toMatchObject({ price: 100, oldPrice: null });
  });

  it("sıfır ya da negatif indirimli fiyat yok sayılır", () => {
    expect(
      resolveCreateSalePricing({ price: 100, salePrice: 0 }),
    ).toMatchObject({ price: 100, oldPrice: null });
    expect(
      resolveCreateSalePricing({ price: 100, salePrice: -5 }),
    ).toMatchObject({ price: 100, oldPrice: null });
  });

  it("indirim tarihleri yalnız indirim varken taşınır", () => {
    expect(
      resolveCreateSalePricing({
        price: 100,
        salePrice: 80,
        saleStartDate: "2026-08-01",
        saleEndDate: "2026-08-31",
      }),
    ).toEqual({
      price: 80,
      oldPrice: 100,
      saleStartDate: new Date("2026-08-01"),
      saleEndDate: new Date("2026-08-31"),
    });

    expect(
      resolveCreateSalePricing({
        price: 100,
        saleStartDate: "2026-08-01",
        saleEndDate: "2026-08-31",
      }),
    ).toMatchObject({ saleStartDate: null, saleEndDate: null });
  });

  it("geçersiz tarih indirimi düşürmez, tarih boş kalır", () => {
    expect(
      resolveCreateSalePricing({
        price: 100,
        salePrice: 80,
        saleStartDate: "bozuk",
      }),
    ).toMatchObject({ price: 80, oldPrice: 100, saleStartDate: null });
  });
});
