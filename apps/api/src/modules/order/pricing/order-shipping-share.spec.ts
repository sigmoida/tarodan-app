import {
  ProductKind,
  ProductStatus,
  ShippingPackageTierCode,
} from "@prisma/client";
import { OrderPricingService } from "./order-pricing.service";
import {
  resolvePackageShippingBuyerShare,
  resolvePackageShippingDecision,
  splitShippingByBuyerShare,
} from "../../shipping/helpers/shipping-tariff.helper";
import {
  flatPackageTiers,
  packageTiers,
} from "../../shipping/testing/tariff-fixture";
import { testTaxPolicy } from "../testing/tax-policy-fixture";

/**
 * BLOCKER: `shippingBuyerShare` önizleme ile tahsilat arasında ayrışıyordu.
 * Quote her satır için `map.set(sellerId, share)` yaptığından SON satırın kuralı
 * kazanıyordu; grup checkout ise kargoyu satıcının İLK satırına yüklediği için
 * O satırın kuralını uyguluyordu. `pricingHash` ücret konfigürasyonunu kapsamadığı
 * için 409 da tetiklenmiyordu → alıcı gösterilenden farklı tutar ödüyordu.
 *
 * Çözüm: paket payı, satır sırasından BAĞIMSIZ tek bir indirgeme ile belirlenir
 * ve her iki yol aynı yardımcıyı kullanır.
 */
describe("resolvePackageShippingBuyerShare", () => {
  it("tek satır → o satırın payı", () => {
    expect(resolvePackageShippingBuyerShare([40])).toBe(40);
  });

  it("karışık paylarda EN DÜŞÜK pay uygulanır (alıcıya vaat edilen sübvansiyon korunur)", () => {
    expect(resolvePackageShippingBuyerShare([100, 40])).toBe(40);
    // Satır sırası sonucu DEĞİŞTİRMEZ — asıl bug buydu.
    expect(resolvePackageShippingBuyerShare([40, 100])).toBe(40);
  });

  it("pay yoksa varsayılan 100 (alıcı tüm kargoyu öder)", () => {
    expect(resolvePackageShippingBuyerShare([])).toBe(100);
  });

  it("aralık dışı değerler 0–100'e sıkıştırılır", () => {
    expect(resolvePackageShippingBuyerShare([150])).toBe(100);
    expect(resolvePackageShippingBuyerShare([-20])).toBe(0);
  });
});

/**
 * Kademe bazlı paya geçişte SIRA kritik hale geldi: pay artık paketin kademesine
 * bağlı, kademe ise toplam desiden çıkıyor. Dört checkout yolu ve önizleme bu tek
 * kararı çağırmalı — aksi halde biri "satırın payı", diğeri "kademenin payı"
 * kullanır ve önizleme ile tahsilat yeniden ayrışır (eski bug'ın kök nedeni).
 */
describe("resolvePackageShippingDecision", () => {
  const tariff = {
    freeShippingEnabled: false,
    freeShippingThreshold: 0,
    packageTiers: packageTiers(100, 130, 160),
  };
  const shares = (small: number, medium: number, large: number) => ({
    small,
    medium,
    large,
  });

  it("kademeyi ÖNCE çözer, payı o kademeden okur", () => {
    // 4 desi → Orta kademe (130 TL) → orta payı %70 uygulanır (küçüğün %100'ü değil).
    const decision = resolvePackageShippingDecision({
      tariff,
      subtotal: 1000,
      billableDesi: 4,
      lineShares: [shares(100, 70, 50)],
    });

    expect(decision.tierCode).toBe(ShippingPackageTierCode.medium);
    expect(decision.fullShipping).toBe(130);
    expect(decision.buyerShare).toBe(70);
    expect(decision.buyer).toBe(91);
    expect(decision.seller).toBe(39);
  });

  it("aynı paketteki farklı kategoriler → o kademenin EN DÜŞÜK payı", () => {
    const decision = resolvePackageShippingDecision({
      tariff,
      subtotal: 1000,
      billableDesi: 10,
      lineShares: [shares(100, 70, 50), shares(100, 100, 80)],
    });

    expect(decision.tierCode).toBe(ShippingPackageTierCode.large);
    expect(decision.buyerShare).toBe(50);
    // Satır sırası sonucu değiştirmez.
    expect(
      resolvePackageShippingDecision({
        tariff,
        subtotal: 1000,
        billableDesi: 10,
        lineShares: [shares(100, 100, 80), shares(100, 70, 50)],
      }).buyerShare,
    ).toBe(50);
  });

  it("ücretsiz kargo eşiği kademenin üstündedir: iki taraf da ödemez", () => {
    const decision = resolvePackageShippingDecision({
      tariff: {
        ...tariff,
        freeShippingEnabled: true,
        freeShippingThreshold: 500,
      },
      subtotal: 500,
      billableDesi: 10,
      lineShares: [shares(100, 70, 50)],
    });

    expect(decision.fullShipping).toBe(0);
    expect(decision.buyer).toBe(0);
    expect(decision.seller).toBe(0);
  });

  it("pay bilgisi yoksa varsayılan 100 (alıcı tüm kargoyu öder)", () => {
    const decision = resolvePackageShippingDecision({
      tariff,
      subtotal: 1000,
      billableDesi: 2,
      lineShares: [],
    });

    expect(decision.buyerShare).toBe(100);
    expect(decision.buyer).toBe(100);
    expect(decision.seller).toBe(0);
  });

  it("buyer + seller her zaman tam kargoya eşittir", () => {
    const decision = resolvePackageShippingDecision({
      tariff: { ...tariff, packageTiers: packageTiers(33.33, 33.33, 33.33) },
      subtotal: 1000,
      billableDesi: 2,
      lineShares: [shares(33, 33, 33)],
    });

    expect(Math.round((decision.buyer + decision.seller) * 100) / 100).toBe(
      33.33,
    );
  });
});

describe("splitShippingByBuyerShare", () => {
  it("payı uygular ve kuruşa yuvarlar", () => {
    expect(splitShippingByBuyerShare(29.99, 50)).toEqual({
      buyer: 15,
      seller: 14.99,
    });
  });

  it("pay 100 → tamamı alıcıya", () => {
    expect(splitShippingByBuyerShare(50, 100)).toEqual({
      buyer: 50,
      seller: 0,
    });
  });

  it("pay 0 → tamamı satıcıya", () => {
    expect(splitShippingByBuyerShare(50, 0)).toEqual({ buyer: 0, seller: 50 });
  });

  it("buyer + seller her zaman tam kargoya eşittir (yuvarlama kaçağı yok)", () => {
    const { buyer, seller } = splitShippingByBuyerShare(33.33, 33);
    expect(Math.round((buyer + seller) * 100) / 100).toBe(33.33);
  });
});

/**
 * Uçtan uca: aynı satıcının farklı `shippingBuyerShare` taşıyan iki kalemi
 * varsa, quote'un gösterdiği alıcı kargosu satır sırasına göre değişmemeli.
 */
describe("OrderPricingService.getCheckoutQuote — mixed shipping shares", () => {
  const BASE = 50;

  const mkProduct = (id: string, categoryId: string) => ({
    id,
    title: id,
    price: 100,
    sellerId: "seller-A",
    categoryId,
    kind: ProductKind.listing,
    status: ProductStatus.active,
    seller: { businessStatus: null, taxId: null },
    shippingDesi: 1,
  });

  const products: Record<string, any> = {
    full: mkProduct("full", "cat-full"), // buyer pays 100%
    subsidized: mkProduct("subsidized", "cat-sub"), // buyer pays 40%
  };

  const makeSvc = () => {
    const prisma = {
      commissionRuleSet: {
        findFirst: jest.fn().mockResolvedValue({ id: "set-1" }),
      },
      platformSetting: {
        // Vergi politikası tek sorguda okunur (OrderTaxPolicyService).
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      product: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(products[where.id] ?? null),
        ),
      },
    } as any;
    const shippingTariffs = {
      getActiveTariffSnapshot: async () => ({
        tariffId: "tariff-1",
        tariffVersion: 1,
        tariff: {
          freeShippingEnabled: false,
          freeShippingThreshold: null,
          packageTiers: flatPackageTiers(BASE),
        },
      }),
    } as any;
    const svc = new OrderPricingService(
      prisma,
      { resolveTaxRate: jest.fn(), calculateTaxAmount: jest.fn() } as any,
      shippingTariffs,
      {
        getEffectiveDisplayPrice: async () => null,
        getEffectiveDisplayPriceMany: async () => new Map(),
        quantityDiscountsForLines: async () => new Map(),
      } as any,
      testTaxPolicy(),
    );
    // Kategoriye göre farklı kargo payı döndür.
    jest.spyOn(svc, "calculateCommission").mockImplementation(
      async (_amount, _sellerId, categoryId) =>
        ({
          buyerFeeAmount: 0,
          sellerFeeAmount: 0,
          shippingBuyerShare: categoryId === "cat-sub" ? 40 : 100,
          shippingBuyerShares: {
            small: categoryId === "cat-sub" ? 40 : 100,
            medium: categoryId === "cat-sub" ? 40 : 100,
            large: categoryId === "cat-sub" ? 40 : 100,
          },
          sellerRuleId: "r1",
        }) as any,
    );
    return svc;
  };

  it("alıcı kargosu satır sırasından BAĞIMSIZDIR", async () => {
    const forward = await makeSvc().getCheckoutQuote({
      items: [{ productId: "full" }, { productId: "subsidized" }],
    });
    const reversed = await makeSvc().getCheckoutQuote({
      items: [{ productId: "subsidized" }, { productId: "full" }],
    });

    expect(forward.shippingAmount).toBe(reversed.shippingAmount);
    // Sübvansiyonlu kalem pakette olduğu için düşük pay uygulanır: 50 * 0.40
    expect(forward.shippingAmount).toBe(20);
  });
});
