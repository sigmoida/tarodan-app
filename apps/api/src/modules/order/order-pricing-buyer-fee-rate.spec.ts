import { effectiveBuyerFeeRate } from "./order-pricing.service";

/**
 * Checkout'ta gösterilen oran şimdiye kadar çeviri metnine gömülüydü ("%3") ve
 * kural setindeki gerçek orandan bağımsızdı: tutar doğru, oran YANLIŞ görünüyordu.
 *
 * Oran artık tahsil edilen tutardan türetilir. Sepette farklı kategoriler (dolayısıyla
 * farklı oranlar) olabileceğinden tek bir kural oranı yanıltıcı olur; bu yüzden
 * ETKİN birleşik oran hesaplanır: alıcı ücreti / ürün alt-toplamı.
 */
describe("effectiveBuyerFeeRate", () => {
  it("tek oranlı sepette kuralın oranını verir", () => {
    expect(effectiveBuyerFeeRate(30, 1000)).toBe(3);
  });

  it("karışık oranlı sepette ETKİN birleşik oranı verir", () => {
    // 1000 TL'de %3 + 1000 TL'de %5 → 80 / 2000 = %4.
    expect(effectiveBuyerFeeRate(80, 2000)).toBe(4);
  });

  it("kuruş oranlarını iki haneye yuvarlar", () => {
    expect(effectiveBuyerFeeRate(33.33, 1000)).toBe(3.33);
    expect(effectiveBuyerFeeRate(1, 3000)).toBe(0.03);
  });

  it("ücret yoksa 0 döner (satır gösterilmez)", () => {
    expect(effectiveBuyerFeeRate(0, 1000)).toBe(0);
  });

  it("alt-toplam 0 ise 0 döner (sıfıra bölme yok)", () => {
    expect(effectiveBuyerFeeRate(0, 0)).toBe(0);
    expect(effectiveBuyerFeeRate(10, 0)).toBe(0);
  });

  it("kupon sonrası indirimli baz kullanıldığında oran o baza göredir", () => {
    // Fee indirimli baz üzerinden hesaplandığı için oran da indirimli bazla
    // tutarlı olmalı; aksi halde alıcıya olduğundan küçük bir oran gösterilir.
    expect(effectiveBuyerFeeRate(27, 900)).toBe(3);
  });
});
