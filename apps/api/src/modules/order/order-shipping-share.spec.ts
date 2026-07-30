import { ProductStatus } from "@prisma/client";
import { OrderPricingService } from "./order-pricing.service";
import {
  resolvePackageShippingBuyerShare,
  splitShippingByBuyerShare,
} from "../shipping/shipping-tariff.helper";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";

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
    status: ProductStatus.active,
    seller: { businessStatus: "pending", taxId: null },
    shippingDesi: 1,
  });

  const products: Record<string, any> = {
    full: mkProduct("full", "cat-full"), // buyer pays 100%
    subsidized: mkProduct("subsidized", "cat-sub"), // buyer pays 40%
  };

  const makeSvc = () => {
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
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
          outboundPackageFee: BASE,
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
      } as any,
    );
    // Kategoriye göre farklı kargo payı döndür.
    jest.spyOn(svc, "calculateCommission").mockImplementation(
      async (_amount, _sellerId, categoryId) =>
        ({
          buyerFeeAmount: 0,
          sellerFeeAmount: 0,
          shippingBuyerShare: categoryId === "cat-sub" ? 40 : 100,
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
