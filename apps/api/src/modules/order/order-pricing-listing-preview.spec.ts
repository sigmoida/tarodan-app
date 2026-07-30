import { OrderPricingService } from "./order-pricing.service";
import { packageTiers } from "../shipping/testing/tariff-fixture";

/**
 * İlan formu / ilan listesi komisyon önizlemesi.
 *
 * Kargo bölüşümü paketin ÇÖZÜLEN kademesinin payından okunmalı — kuralın tek
 * (küçük kademe) payından değil. Aksi halde kademe bazlı pay yapılandırıldığında
 * (örn. küçük %100 alıcı, orta %40 alıcı) orta/büyük paketli ilanın "eline
 * geçecek" tutarı checkout'ta gerçekten kesilecek tutardan sapar.
 */
describe("OrderPricingService listing commission preview", () => {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        businessStatus: null,
        taxId: null,
      }),
    },
  };
  const shippingTariffs = {
    getActiveOutboundTariff: jest.fn().mockResolvedValue({
      id: "tariff-1",
      version: 3,
      outboundPackageFee: 100,
      freeShippingEnabled: false,
      freeShippingThreshold: null,
      packageTiers: packageTiers(100, 180, 260),
    }),
  };
  const service = new OrderPricingService(
    prisma as any,
    {} as any,
    shippingTariffs as any,
    {} as any,
  );

  const flatShares = (share: number) => ({
    small: share,
    medium: share,
    large: share,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      businessStatus: null,
      taxId: null,
    });
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      sellerFeeAmount: 100,
      buyerFeeAmount: 30,
      commissionAmount: 130,
      shippingBuyerShare: 40,
      shippingBuyerShares: flatShares(40),
    } as any);
  });

  it("deducts the seller share of the resolved package tier from seller net", async () => {
    // Küçük paket (desi 2) → 100 TL; pay %40 alıcı / %60 satıcı.
    const preview = await (service.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      2,
    );

    expect(preview).toMatchObject({
      fullShippingAmount: 100,
      buyerShippingAmount: 40,
      sellerShippingAmount: 60,
      shippingAmount: 60,
      sellerNetAmount: 840, // 1000 − 100 komisyon − 60 kargo payı
      shippingDesi: 2,
      packageTier: "small",
    });
  });

  it("büyük paket kademesinde satıcı payı kademe fiyatından hesaplanır", async () => {
    // Orta paket (desi 5) → 180 TL; satıcı payı %60 → 108.
    const preview = await (service.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      5,
    );

    expect(preview).toMatchObject({
      fullShippingAmount: 180,
      buyerShippingAmount: 72,
      sellerShippingAmount: 108,
      sellerNetAmount: 792,
      packageTier: "medium",
    });
  });

  it("does not deduct shipping when the commission rule assigns it all to buyer", async () => {
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      sellerFeeAmount: 100,
      buyerFeeAmount: 30,
      commissionAmount: 130,
      shippingBuyerShare: 100,
      shippingBuyerShares: flatShares(100),
    } as any);

    const preview = await (service.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      2,
    );

    expect(preview.shippingAmount).toBe(0);
    expect(preview.sellerShippingAmount).toBe(0);
    expect(preview.sellerNetAmount).toBe(900);
  });

  it("kademe bazlı paylar: bölüşüm ÇÖZÜLEN kademenin payıyla yapılır, küçük kademenin değil", async () => {
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      sellerFeeAmount: 100,
      buyerFeeAmount: 30,
      commissionAmount: 130,
      // Geriye-uyum alanı İLK kademenin payıdır (small=100) — eski hata tam
      // buradan çıkıyordu: orta paket için de bu değer kullanılıyordu.
      shippingBuyerShare: 100,
      shippingBuyerShares: { small: 100, medium: 40, large: 50 },
    } as any);

    // Orta paket (desi 5) → 180 TL; ORTA kademenin payı %40 → satıcı 108.
    const preview = await (service.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      5,
    );

    expect(preview).toMatchObject({
      fullShippingAmount: 180,
      buyerShippingAmount: 72,
      sellerShippingAmount: 108,
      shippingAmount: 108,
      sellerNetAmount: 792,
      packageTier: "medium",
    });
  });

  it("büyük kademe kendi payını kullanır", async () => {
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      sellerFeeAmount: 100,
      buyerFeeAmount: 30,
      commissionAmount: 130,
      shippingBuyerShare: 100,
      shippingBuyerShares: { small: 100, medium: 40, large: 50 },
    } as any);

    // Büyük paket (desi 10) → 260 TL; pay %50 → satıcı 130.
    const preview = await (service.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      10,
    );

    expect(preview).toMatchObject({
      fullShippingAmount: 260,
      buyerShippingAmount: 130,
      sellerShippingAmount: 130,
      sellerNetAmount: 770,
      packageTier: "large",
    });
  });

  describe("batch preview (ilanlarım listesi)", () => {
    it("her kalemin paket boyutunu kendi kademe fiyatı ve payıyla hesaplar", async () => {
      jest.spyOn(service, "calculateCommission").mockResolvedValue({
        sellerFeeAmount: 100,
        buyerFeeAmount: 30,
        commissionAmount: 130,
        shippingBuyerShare: 100,
        shippingBuyerShares: { small: 100, medium: 40, large: 50 },
      } as any);

      const { results } = await service.getCommissionPreviewBatch("seller-1", [
        { amount: 1000, categoryId: "category-1", packageTier: "small" as any },
        {
          amount: 1000,
          categoryId: "category-1",
          packageTier: "medium" as any,
        },
        { amount: 1000, categoryId: "category-1", packageTier: "large" as any },
      ]);

      // small: pay %100 alıcı → kesinti yok; medium: 180×%60=108; large: 260×%50=130.
      expect(results.map((r) => r.sellerNetAmount)).toEqual([900, 792, 770]);
    });

    it("paket boyutu verilmeyen kalem küçük paket varsayılır (geriye uyum)", async () => {
      const { results } = await service.getCommissionPreviewBatch("seller-1", [
        { amount: 1000, categoryId: "category-1" },
      ]);

      // Küçük paket 100 TL × %60 satıcı payı = 60 → 1000 − 100 − 60.
      expect(results[0].sellerNetAmount).toBe(840);
    });
  });
});
