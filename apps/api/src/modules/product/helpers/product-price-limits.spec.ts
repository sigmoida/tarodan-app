import { BadRequestException } from "@nestjs/common";
import {
  assertProductPriceWithinLimits,
  isStoredProductPrice,
  loadProductPriceLimits,
} from "./product-price-limits";

const prismaWith = (rows: Record<string, string | undefined>) =>
  ({
    platformSetting: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(
          rows[where.settingKey] === undefined
            ? null
            : { settingValue: rows[where.settingKey] },
        ),
      ),
    },
  }) as any;

describe("loadProductPriceLimits", () => {
  it("sayısal ayarları okur", async () => {
    await expect(
      loadProductPriceLimits(
        prismaWith({ min_product_price: "250", max_product_price: "9999.5" }),
      ),
    ).resolves.toEqual({ minPrice: 250, maxPrice: 9999.5 });
  });

  it.each([undefined, "", "   ", "abc"])(
    "%j değeri 'kural yok' (null) demektir",
    async (value) => {
      await expect(
        loadProductPriceLimits(
          prismaWith({ min_product_price: value, max_product_price: value }),
        ),
      ).resolves.toEqual({ minPrice: null, maxPrice: null });
    },
  );
});

describe("assertProductPriceWithinLimits", () => {
  const limits = { minPrice: 250, maxPrice: 1000 };

  it("sınır içindeki ve sınırdaki fiyatı kabul eder", () => {
    expect(() => assertProductPriceWithinLimits(250, limits)).not.toThrow();
    expect(() => assertProductPriceWithinLimits(1000, limits)).not.toThrow();
  });

  it("alt sınırın altını i18n mesajıyla reddeder", () => {
    try {
      assertProductPriceWithinLimits(249.99, limits);
      throw new Error("beklenen hata atılmadı");
    } catch (error: any) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.response).toMatchObject({
        i18nKey: "server.product.priceBelowMinimum",
        i18nParams: { minPrice: 250 },
      });
    }
  });

  it("üst sınırın üstünü reddeder", () => {
    expect(() => assertProductPriceWithinLimits(1000.01, limits)).toThrow(
      BadRequestException,
    );
  });

  it("sınır yoksa hiçbir fiyatı reddetmez", () => {
    const none = { minPrice: null, maxPrice: null };
    expect(() => assertProductPriceWithinLimits(1, none)).not.toThrow();
    expect(() => assertProductPriceWithinLimits(1e9, none)).not.toThrow();
  });
});

describe("isStoredProductPrice", () => {
  it("Decimal benzeri değerlerle sayısal karşılaştırır", () => {
    const decimal = { toString: () => "250.10", valueOf: () => 250.1 };
    expect(isStoredProductPrice(250.1, [null, decimal])).toBe(true);
    expect(isStoredProductPrice(250.1, ["250.10"])).toBe(true);
  });

  it("kayıtlı değer yoksa ya da fark varsa false döner", () => {
    expect(isStoredProductPrice(200, [null, undefined])).toBe(false);
    expect(isStoredProductPrice(200, [200.5, 400])).toBe(false);
    expect(isStoredProductPrice(200, [])).toBe(false);
  });
});
