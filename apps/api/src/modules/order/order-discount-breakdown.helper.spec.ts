import { DiscountFundedBy } from "@prisma/client";
import { buildOrderDiscountBreakdown } from "./order-discount-breakdown.helper";

/**
 * Regresyon: otomatik kampanyanın finansman bilgisi siparişe hiç taşınmıyordu.
 * `platformFundedDiscount` yalnız KUPONDAN hesaplanıyor, kampanyanın `fundedBy`
 * alanı yok sayılıyordu → platform-fonlu bir kampanyanın maliyeti sessizce
 * satıcıya kalıyor, shared kampanyanın oranı tamamen kayboluyordu. Uygulanan
 * kampanyanın kimliği de siparişte durmadığı için mutabakat yapılamıyordu.
 */
describe("buildOrderDiscountBreakdown", () => {
  const campaign = (
    fundedBy: DiscountFundedBy,
    platformFundedShare: number,
    discountPerUnit = 20,
  ) => ({
    discountId: "campaign-1",
    name: "Kampanya",
    discountPerUnit,
    fundedBy,
    platformFundedShare,
  });

  /** 100 TL liste → 80 TL satış (satıcının kendi indirimi). */
  const onSale = {
    originalUnitPrice: 100,
    saleUnitPrice: 80,
    unitPrice: 80,
    campaign: null,
  };

  it("satıcının kendi indirimini kampanyadan AYRI tutar", () => {
    const result = buildOrderDiscountBreakdown({
      resolved: onSale,
      quantity: 1,
    });

    expect(result.saleDiscount).toBe(20);
    expect(result.campaignDiscount).toBe(0);
    expect(result.totalDiscount).toBe(20);
    // Satıcının kendi fiyat indirimini platform finanse etmez.
    expect(result.platformFundedDiscount).toBe(0);
  });

  describe("kampanya finansmanı", () => {
    const withCampaign = (fundedBy: DiscountFundedBy, share: number) => ({
      ...onSale,
      unitPrice: 60,
      campaign: campaign(fundedBy, share),
    });

    it("seller-funded kampanyanın maliyeti platforma yazılmaz", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: withCampaign(DiscountFundedBy.seller, 0),
        quantity: 1,
      });

      expect(result.campaignDiscount).toBe(20);
      expect(result.platformFundedDiscount).toBe(0);
      expect(result.campaignFundedBy).toBe(DiscountFundedBy.seller);
    });

    it("platform-funded kampanyanın TAMAMI platforma yazılır", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: withCampaign(DiscountFundedBy.platform, 1),
        quantity: 1,
      });

      expect(result.campaignDiscount).toBe(20);
      expect(result.platformFundedDiscount).toBe(20);
    });

    it("shared kampanyada oran korunur", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: withCampaign(DiscountFundedBy.shared, 0.3),
        quantity: 1,
      });

      expect(result.platformFundedDiscount).toBe(6);
      expect(result.campaignPlatformFundedShare).toBe(0.3);
    });

    it("kampanya indirimi ADETLE çarpılır", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: withCampaign(DiscountFundedBy.platform, 1),
        quantity: 3,
      });

      expect(result.saleDiscount).toBe(60);
      expect(result.campaignDiscount).toBe(60);
      expect(result.platformFundedDiscount).toBe(60);
    });

    it("uygulanan kampanyanın kimliği dökümde durur", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: withCampaign(DiscountFundedBy.platform, 1),
        quantity: 1,
      });

      expect(result.campaignId).toBe("campaign-1");
    });
  });

  describe("kampanya + kupon birlikte", () => {
    it("platform payı iki bileşenden BİRLİKTE hesaplanır", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: {
          ...onSale,
          unitPrice: 60,
          campaign: campaign(DiscountFundedBy.platform, 1),
        },
        quantity: 1,
        couponDiscount: 10,
        couponPlatformFundedShare: 0.5,
      });

      // 20 (kampanya, tamamı platform) + 10×0.5 (kupon) = 25
      expect(result.platformFundedDiscount).toBe(25);
      // Liste fiyatına göre toplam: 20 satıcı indirimi + 20 kampanya + 10 kupon
      expect(result.totalDiscount).toBe(50);
    });

    it("her iki taraf da seller-funded ise platform payı 0'dır", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: {
          ...onSale,
          unitPrice: 60,
          campaign: campaign(DiscountFundedBy.seller, 0),
        },
        quantity: 1,
        couponDiscount: 10,
        couponPlatformFundedShare: 0,
      });

      expect(result.platformFundedDiscount).toBe(0);
    });
  });

  describe("sınırlar", () => {
    it("platform payı liste tutarını aşamaz", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: {
          originalUnitPrice: 100,
          saleUnitPrice: 100,
          unitPrice: 0,
          campaign: campaign(DiscountFundedBy.platform, 1, 100),
        },
        quantity: 2,
        couponDiscount: 0,
      });

      expect(result.platformFundedDiscount).toBeLessThanOrEqual(
        100 * 2, // liste tutarı
      );
    });

    it("bozuk oran güvenli aralığa çekilir", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: {
          ...onSale,
          unitPrice: 60,
          campaign: campaign(DiscountFundedBy.shared, 5),
        },
        quantity: 1,
        couponDiscount: 10,
        couponPlatformFundedShare: -3,
      });

      expect(result.campaignPlatformFundedShare).toBe(1);
      expect(result.couponPlatformFundedShare).toBe(0);
      expect(result.platformFundedDiscount).toBe(20);
    });

    it("indirim yoksa her kalem 0'dır", () => {
      const result = buildOrderDiscountBreakdown({
        resolved: {
          originalUnitPrice: 100,
          saleUnitPrice: 100,
          unitPrice: 100,
          campaign: null,
        },
        quantity: 1,
      });

      expect(result.totalDiscount).toBe(0);
      expect(result.platformFundedDiscount).toBe(0);
      expect(result.campaignId).toBeNull();
    });
  });
});
