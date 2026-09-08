import {
  buildSettlementRow,
  settlementMaturityDays,
  settlementTransactionType,
  type SettlementOrderInput,
} from "./settlement-report-row";

/**
 * Dökümün satırı faturanın DAYANAĞIdır: müşavir bu satıra bakıp komisyonun
 * hangi siparişten ve hangi oranla doğduğunu görebilmeli. Oran sipariş üzerinde
 * saklanmadığı için tutardan geri hesaplanır — testin asıl konusu bu türetmeler.
 */

const order = (
  over: Partial<SettlementOrderInput> = {},
): SettlementOrderInput => ({
  orderNumber: "ORD-10001",
  packageNumber: "PKG-000123",
  origin: "direct_sale",
  cancellationType: null,
  createdAt: new Date("2026-08-01T10:00:00Z"),
  paidAt: new Date("2026-08-01T10:05:00Z"),
  deliveredAt: new Date("2026-08-04T12:00:00Z"),
  releaseAt: new Date("2026-08-10T12:00:00Z"),
  quantity: 1,
  unitPrice: 999,
  subtotal: 999,
  sellerFeeAmount: 109.89,
  sellerCommissionAmount: 59.94,
  sellerPlatformFeeAmount: 49.95,
  sellerShippingAmount: 60,
  sellerServiceTaxAmount: 33.98,
  withholdingTaxAmount: 9.99,
  sellerId: "s1",
  sellerName: "Toolstoy",
  sellerCompanyName: "SERHATLAR LTD ŞTİ",
  buyerId: "b1",
  buyerName: "Ayşe Yılmaz",
  productName: "Oyuncak Araba",
  productCode: "U-10042",
  ...over,
});

describe("buildSettlementRow", () => {
  it("komisyon oranını tahsil edilen tutardan geri hesaplar", () => {
    // 59,94 / 999 = %6 — satıcı komisyonu, alıcıdan alınan değil.
    expect(buildSettlementRow(order()).commissionRate).toBe(6);
  });

  it("Tarodan hakedişi SATICI tarafı kesintidir", () => {
    // 59,94 komisyon + 49,95 platform hizmet bedeli.
    expect(buildSettlementRow(order()).platformEarning).toBe(109.89);
  });

  it("satıcı hakedişi payout formülünün aynısıdır", () => {
    // 999 − 109,89 ücret − 33,98 hizmet KDV'si − 9,99 stopaj − 60 kargo.
    expect(buildSettlementRow(order()).sellerEarning).toBe(785.14);
  });

  it("stopajı olduğu gibi taşır (bireysel satıcıda 0)", () => {
    expect(buildSettlementRow(order()).withholdingTax).toBe(9.99);
    expect(
      buildSettlementRow(order({ withholdingTaxAmount: 0 })).withholdingTax,
    ).toBe(0);
  });

  it("kayıt no koli kodudur, koli yoksa sipariş numarasına düşer", () => {
    expect(buildSettlementRow(order()).recordNo).toBe("PKG-000123");
    expect(buildSettlementRow(order({ packageNumber: null })).recordNo).toBe(
      "ORD-10001",
    );
  });

  it("listeleme fiyatı ilan fiyatı × adettir (ödenen tutar değil)", () => {
    expect(
      buildSettlementRow(order({ quantity: 3, unitPrice: 250, subtotal: 600 }))
        .listingPrice,
    ).toBe(750);
  });

  it("ödeme kaydı yoksa işlem tarihi sipariş tarihine düşer", () => {
    const row = buildSettlementRow(order({ paidAt: null }));
    expect(row.transactionAt).toEqual(new Date("2026-08-01T10:00:00Z"));
  });

  it("matrahı olmayan siparişte oran boş kalır — sıfıra bölünmez", () => {
    expect(
      buildSettlementRow(order({ subtotal: 0 })).commissionRate,
    ).toBeNull();
  });
});

describe("settlementTransactionType", () => {
  it("iptal/iade satışın önüne geçer", () => {
    expect(settlementTransactionType("offer", "iade")).toBe("İade");
    expect(settlementTransactionType("direct_sale", "iptal")).toBe("İptal");
  });

  it("siparişin kaynağını ayırır", () => {
    expect(settlementTransactionType("offer", null)).toBe("Teklif Satışı");
    expect(settlementTransactionType("platform_service", null)).toBe(
      "Platform Hizmeti",
    );
    expect(settlementTransactionType("direct_sale", null)).toBe("Satış");
    expect(settlementTransactionType(null, null)).toBe("Satış");
  });
});

describe("settlementMaturityDays", () => {
  it("teslimat ile serbest bırakma arasındaki günü verir", () => {
    expect(
      settlementMaturityDays(
        new Date("2026-08-04T12:00:00Z"),
        new Date("2026-08-10T12:00:00Z"),
      ),
    ).toBe(6);
  });

  it("teslimattan önce serbest bırakılan hold negatif gün üretmez", () => {
    expect(
      settlementMaturityDays(
        new Date("2026-08-10T12:00:00Z"),
        new Date("2026-08-04T12:00:00Z"),
      ),
    ).toBe(0);
  });

  it("teslim edilmemiş ya da vadesi olmayan siparişte boş", () => {
    expect(settlementMaturityDays(null, new Date())).toBeNull();
    expect(settlementMaturityDays(new Date(), null)).toBeNull();
  });
});
