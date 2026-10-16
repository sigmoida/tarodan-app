import { BadRequestException } from "@nestjs/common";
import type { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";

export interface ProductPriceLimits {
  minPrice: number | null;
  maxPrice: number | null;
}

export async function loadProductPriceLimits(
  prisma: Pick<PrismaService, "platformSetting">,
): Promise<ProductPriceLimits> {
  const [minSetting, maxSetting] = await Promise.all([
    prisma.platformSetting.findUnique({
      where: { settingKey: "min_product_price" },
      select: { settingValue: true },
    }),
    prisma.platformSetting.findUnique({
      where: { settingKey: "max_product_price" },
      select: { settingValue: true },
    }),
  ]);
  const parse = (raw: string | null | undefined) => {
    if (!raw?.trim()) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    minPrice: parse(minSetting?.settingValue),
    maxPrice: parse(maxSetting?.settingValue),
  };
}

export function productPriceLimitViolation(
  price: number,
  limits: ProductPriceLimits,
): { type: "minimum" | "maximum"; limit: number } | null {
  if (limits.minPrice != null && price < limits.minPrice) {
    return { type: "minimum", limit: limits.minPrice };
  }
  if (limits.maxPrice != null && price > limits.maxPrice) {
    return { type: "maximum", limit: limits.maxPrice };
  }
  return null;
}

/**
 * Fiyat sınırı ihlalini kullanıcıya dönecek 400'e çevirir (create + update
 * aynı mesajı verir). Sınır yoksa ya da fiyat içindeyse hiçbir şey yapmaz.
 */
export function assertProductPriceWithinLimits(
  price: number,
  limits: ProductPriceLimits,
): void {
  const violation = productPriceLimitViolation(price, limits);
  if (violation?.type === "minimum") {
    throw new BadRequestException(
      i18nMessage("server.product.priceBelowMinimum", {
        minPrice: violation.limit,
      }),
    );
  }
  if (violation?.type === "maximum") {
    throw new BadRequestException(
      i18nMessage("server.product.priceAboveMaximum", {
        maxPrice: violation.limit,
      }),
    );
  }
}

/**
 * Aday fiyat, ilanın KAYITLI fiyatlarından biriyle aynı mı? (Decimal güvenli:
 * kuruş hassasiyetinde sayısal karşılaştırma.)
 *
 * Alt/üst sınır geriye dönük işlemez: sınırın altında kalmış mevcut ilan
 * yayında ve satın alınabilir kalır, fiyatına dokunmadan düzenlenebilir.
 * Sınır yalnız fiyat gerçekten DEĞİŞTİĞİNDE (ya da yeni indirim girildiğinde)
 * uygulanır. Kayıtlı fiyatlar = `price`, `oldPrice`, `salePrice`: formdaki
 * "Fiyat" indirimliyken `oldPrice`, değilken `price`'tır.
 */
export function isStoredProductPrice(
  candidate: number,
  stored: ReadonlyArray<unknown>,
): boolean {
  return stored.some((value) => {
    if (value == null) return false;
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n - candidate) < 0.005;
  });
}
