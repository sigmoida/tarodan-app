import { buildPlatformSaleLines, InvoiceLineItem } from "./invoice-lines";

/**
 * Platform satışı, alıcının ürün için aldığı TEK yasal belgedir — bu yüzden ürün
 * faturasının taşıması gerekenleri taşımalı: ürünün ADI, ADEDİ, ayrı kargo ve
 * hizmet bedeli satırları, her satırda kendi KDV oranı.
 *
 * Eskiden belge tek satırlıydı: sabit "Ürün/hizmet bedeli" adı, adet hep 1, kargo
 * ve hizmet bedeli tutara gömülü, tek global KDV oranı.
 *
 * Tutar iskeleti (order.totalAmount):
 *   subtotal (KDV DAHİL) + buyerShippingAmount (hariç) + buyerFeeAmount (hariç)
 *   + buyerServiceTaxAmount (kargo + hizmet bedelinin KDV'si)
 */
const basis = () => ({
  productName: "Çocuk Kitabı",
  quantity: 3,
  productGross: 165, // 3 × 55 TL, %10 KDV dahil
  shippingNet: 40,
  buyerFeeNet: 10,
  productVatRate: 10,
  serviceVatRate: 20,
  ratio: 1,
});

const total = (lines: InvoiceLineItem[]) =>
  Math.round(
    lines.reduce((sum, l) => sum + l.net * (1 + l.vatRate / 100), 0) * 100,
  ) / 100;

describe("buildPlatformSaleLines", () => {
  it("ürünü adı ve adediyle yazar", () => {
    const [product] = buildPlatformSaleLines(basis());
    expect(product.name).toBe("Çocuk Kitabı");
    expect(product.quantity).toBe(3);
    expect(product.vatRate).toBe(10);
    // 165 KDV dahil, %10 → 150 matrah.
    expect(product.net).toBeCloseTo(150, 2);
  });

  it("kargo ve hizmet bedelini AYRI satırlara alır, hizmet oranıyla", () => {
    const lines = buildPlatformSaleLines(basis());
    expect(lines).toHaveLength(3);
    const [, shipping, fee] = lines;
    expect(shipping.net).toBeCloseTo(40, 2);
    expect(shipping.vatRate).toBe(20);
    expect(shipping.quantity).toBe(1);
    expect(fee.net).toBeCloseTo(10, 2);
    expect(fee.vatRate).toBe(20);
  });

  it("satırların KDV dahil toplamı siparişin tahsil edilen tutarına eşittir", () => {
    // 165 + 40 + 10 + (50 × %20 = 10) = 225
    expect(total(buildPlatformSaleLines(basis()))).toBeCloseTo(225, 2);
  });

  it("sıfır kalemler satır üretmez (kargo bedava, hizmet bedeli yok)", () => {
    const lines = buildPlatformSaleLines({
      ...basis(),
      shippingNet: 0,
      buyerFeeNet: 0,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("Çocuk Kitabı");
  });

  it("kısmi iade sonrası tüm satırlar aynı oranda küçülür", () => {
    const lines = buildPlatformSaleLines({ ...basis(), ratio: 0.5 });
    expect(lines[0].net).toBeCloseTo(75, 2);
    expect(lines[1].net).toBeCloseTo(20, 2);
    expect(lines[2].net).toBeCloseTo(5, 2);
    expect(total(lines)).toBeCloseTo(112.5, 2);
  });

  it("bölünmeyen birim fiyatta satır toplamı korunur (100/3)", () => {
    const lines = buildPlatformSaleLines({
      ...basis(),
      productGross: 120, // %20 → 100 matrah, 3 adet
      productVatRate: 20,
      shippingNet: 0,
      buyerFeeNet: 0,
    });
    expect(lines[0].net).toBeCloseTo(100, 2);
    // Birim fiyat yuvarlanırsa 33,33 × 3 = 99,99 olurdu; satır toplamı taşınır.
    expect(lines[0].unitPrice).toBeCloseTo(100 / 3, 4);
  });

  it("ürün adı yoksa nötr bir ada düşer, adet en az 1'dir", () => {
    const [product] = buildPlatformSaleLines({
      ...basis(),
      productName: "",
      quantity: 0,
    });
    expect(product.name.length).toBeGreaterThan(0);
    expect(product.quantity).toBe(1);
  });

  it("ürün tutarı yoksa hiç satır üretmez (çağıran tek kaleme düşer)", () => {
    expect(
      buildPlatformSaleLines({
        ...basis(),
        productGross: 0,
        shippingNet: 0,
        buyerFeeNet: 0,
      }),
    ).toHaveLength(0);
  });
});
