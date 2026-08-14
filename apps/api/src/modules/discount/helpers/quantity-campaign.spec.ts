import { DiscountType } from "@prisma/client";
import {
  bestQuantityCampaignDiscount,
  quantityCampaignDiscount,
} from "./quantity-campaign";

describe("quantity campaigns (bogo / bulk_quantity)", () => {
  const bogo = (buy: number, get: number) => ({
    id: "bogo-1",
    name: "Al-Bedava",
    type: DiscountType.bogo,
    value: 0,
    buyQuantity: buy,
    getQuantity: get,
  });
  const bulk = (min: number, percent: number) => ({
    id: "bulk-1",
    name: "Çoklu Alım",
    type: DiscountType.bulk_quantity,
    value: percent,
    minQuantity: min,
  });

  describe("bogo — X al Y bedava (satır bazlı, İ3)", () => {
    it("'2 al 1 öde' (buy 1 get 1): 2 adette 1 birim bedava", () => {
      expect(quantityCampaignDiscount(bogo(1, 1), 100, 2)).toBe(100);
    });

    it("paket tamamlanmadan indirim yoktur", () => {
      expect(quantityCampaignDiscount(bogo(1, 1), 100, 1)).toBe(0);
      expect(quantityCampaignDiscount(bogo(2, 1), 100, 2)).toBe(0);
    });

    it("her tam pakette tekrarlar: 'buy 1 get 1' 5 adette 2 bedava", () => {
      expect(quantityCampaignDiscount(bogo(1, 1), 100, 5)).toBe(200);
    });

    it("'3 al 2 öde' (buy 2 get 1): 3 adette 1 bedava", () => {
      expect(quantityCampaignDiscount(bogo(2, 1), 50, 3)).toBe(50);
      expect(quantityCampaignDiscount(bogo(2, 1), 50, 6)).toBe(100);
    });

    it("buy/get tanımsızsa devreye girmez", () => {
      expect(
        quantityCampaignDiscount({ ...bogo(1, 1), buyQuantity: null }, 100, 4),
      ).toBe(0);
    });
  });

  describe("bulk_quantity — N adet ve üzeri %V (satır bazlı, İ7)", () => {
    it("eşik satır adediyle karşılanır; sepetteki farklı ürünler sayılmaz", () => {
      expect(quantityCampaignDiscount(bulk(3, 10), 100, 3)).toBe(30);
      expect(quantityCampaignDiscount(bulk(3, 10), 100, 2)).toBe(0);
    });

    it("minQuantity < 2 koşulsuz indirime dönüşemez", () => {
      expect(quantityCampaignDiscount(bulk(1, 10), 100, 1)).toBe(0);
    });

    it("yüzde 100 ile sınırlanır", () => {
      expect(quantityCampaignDiscount(bulk(2, 150), 100, 2)).toBe(200);
    });
  });

  it("maxDiscountAmount tavana kırpar", () => {
    expect(
      quantityCampaignDiscount(
        { ...bogo(1, 1), maxDiscountAmount: 80 },
        100,
        2,
      ),
    ).toBe(80);
    expect(
      quantityCampaignDiscount(
        { ...bulk(2, 50), maxDiscountAmount: 40 },
        100,
        4,
      ),
    ).toBe(40);
  });

  it("aynı satıra uyanlardan en yüksek indirimi veren kazanır", () => {
    const winner = bestQuantityCampaignDiscount(
      [bulk(2, 10), bogo(1, 1)],
      100,
      4,
    );
    // bulk: 400×%10=40; bogo: 2 bedava=200 → bogo kazanır.
    expect(winner?.campaign.id).toBe("bogo-1");
    expect(winner?.amount).toBe(200);
  });

  it("hiçbiri tetiklenmezse null döner", () => {
    expect(bestQuantityCampaignDiscount([bulk(3, 10)], 100, 2)).toBeNull();
  });
});
