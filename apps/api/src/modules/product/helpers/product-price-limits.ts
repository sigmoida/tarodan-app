import type { PrismaService } from "../../../prisma";

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
