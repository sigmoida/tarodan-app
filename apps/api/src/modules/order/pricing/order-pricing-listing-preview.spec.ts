import { OrderPricingService } from "./order-pricing.service";
import { packageTiers } from "../../shipping/testing/tariff-fixture";
import { noVatTaxPolicy, testTaxPolicy } from "../testing/tax-policy-fixture";

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
    commissionRuleSet: {
      findFirst: jest.fn().mockResolvedValue({ id: "set-1" }),
    },
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
      freeShippingEnabled: false,
      freeShippingThreshold: null,
      packageTiers: packageTiers(100, 180, 260),
    }),
  };
  // Bu suite KARGO BÖLÜŞÜMÜNÜ ölçüyor; vergiler kapatılarak net tutarlar
  // yalnız bölüşümü yansıtır. Hizmet KDV'sinin nete etkisi aşağıda ayrı
  // testte ve order-net.helper.spec.ts'te kapsanıyor.
  const service = new OrderPricingService(
    prisma as any,
    {} as any,
    shippingTariffs as any,
    {} as any,
    noVatTaxPolicy(),
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

  it("üretim politikası: hizmet KDV'si ve stopaj da netten düşülür", async () => {
    // Aynı kargo bölüşümü, ama vergiler açık (varsayılan politika).
    const taxed = new OrderPricingService(
      prisma as any,
      {} as any,
      shippingTariffs as any,
      {} as any,
      testTaxPolicy(),
    );
    jest.spyOn(taxed, "calculateCommission").mockResolvedValue({
      sellerFeeAmount: 100,
      buyerFeeAmount: 30,
      commissionAmount: 130,
      sellerCommissionAmount: 60,
      sellerPlatformFeeAmount: 40,
      buyerCommissionAmount: 18,
      buyerServiceFeeAmount: 12,
      shippingBuyerShare: 40,
      shippingBuyerShares: flatShares(40),
    } as any);

    const preview = await (taxed.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      2,
    );

    // Satıcı hizmet KDV'si: (60 + 40 + 60 kargo) x %20 = 32
    expect(preview.sellerServiceTaxAmount).toBe(32);
    // Alıcı hizmet KDV'si: (18 + 12 + 40 kargo) x %20 = 14
    expect(preview.buyerServiceTaxAmount).toBe(14);
    // Bireysel satıcı stopaj kapsamı dışındadır.
    expect(preview.withholdingTaxAmount).toBe(0);
    // 1000 − 100 (ücret) − 60 (kargo payı) − 32 (KDV) = 808
    expect(preview.sellerNetAmount).toBe(808);
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

  describe("packageTierShipping (ilan formundaki üç kart)", () => {
    it("her kademe için SATICI payını verir — seçili kademeden bağımsız", async () => {
      jest.spyOn(service, "calculateCommission").mockResolvedValue({
        sellerFeeAmount: 100,
        buyerFeeAmount: 30,
        commissionAmount: 130,
        shippingBuyerShare: 100,
        shippingBuyerShares: { small: 100, medium: 40, large: 50 },
      } as any);

      // Seçili kademe küçük olsa da üç kartın tutarı birden döner.
      const preview = await (service.getCommissionPreview as any)(
        1000,
        "seller-1",
        "category-1",
        2,
      );

      expect(preview.packageTierShipping).toEqual([
        // small: pay %100 alıcı → satıcı ödemiyor
        { code: "small", sellerShippingAmount: 0 },
        // medium: 180 × %60 = 108
        { code: "medium", sellerShippingAmount: 108 },
        // large: 260 × %50 = 130
        { code: "large", sellerShippingAmount: 130 },
      ]);
    });

    it("seçili kademenin kart tutarı özet kutusundaki kesintiyle aynıdır", async () => {
      // Kart ile altındaki "Kargo ücreti" satırının ayrışması bu işin çıkış
      // noktasıydı; ikisi aynı karar fonksiyonundan gelmeli.
      const preview = await (service.getCommissionPreview as any)(
        1000,
        "seller-1",
        "category-1",
        5,
      );

      const selectedCard = preview.packageTierShipping.find(
        (tier: { code: string }) => tier.code === preview.packageTier,
      );
      expect(selectedCard.sellerShippingAmount).toBe(preview.shippingAmount);
    });

    it("kart tutarı satıcı payıdır, tam kargo bedeli DEĞİL", async () => {
      const preview = await (service.getCommissionPreview as any)(
        1000,
        "seller-1",
        "category-1",
        2,
      );

      // Küçük paketin tam bedeli 100, payı %60 → 60. Kart 100 gösterseydi
      // satıcı ödemeyeceği bir tutara bakarak karar verirdi.
      expect(preview.fullShippingAmount).toBe(100);
      expect(preview.packageTierShipping[0]).toEqual({
        code: "small",
        sellerShippingAmount: 60,
      });
    });

    it("ücretsiz kargo eşiği aşıldığında üç kart da sıfırlanır", async () => {
      const freeShipping = new OrderPricingService(
        prisma as any,
        {} as any,
        {
          getActiveOutboundTariff: jest.fn().mockResolvedValue({
            id: "tariff-1",
            version: 3,
            freeShippingEnabled: true,
            freeShippingThreshold: 500,
            packageTiers: packageTiers(100, 180, 260),
          }),
        } as any,
        {} as any,
        noVatTaxPolicy(),
      );
      jest.spyOn(freeShipping, "calculateCommission").mockResolvedValue({
        sellerFeeAmount: 100,
        buyerFeeAmount: 30,
        commissionAmount: 130,
        shippingBuyerShare: 40,
        shippingBuyerShares: flatShares(40),
      } as any);

      // Kart tutarının ilanın FİYATINA da bağlı olmasının nedeni bu: sabit
      // tarife tutarı gösteren eski kart bunu hiç yansıtamıyordu.
      const preview = await (freeShipping.getCommissionPreview as any)(
        1000,
        "seller-1",
        "category-1",
        2,
      );

      expect(
        preview.packageTierShipping.map(
          (tier: { sellerShippingAmount: number }) => tier.sellerShippingAmount,
        ),
      ).toEqual([0, 0, 0]);
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
