import { DiscountScope, DiscountType } from "@prisma/client";
import { DiscountScopeService } from "../discount-scope.service";
import { ProductPriceResolver } from "../product-price-resolver.service";

/**
 * Testlerde kullanılacak fiyat çözümleyici — kendi prisma sahtesini taşır,
 * böylece her spec'in kendi mock'una `discount.findMany` eklemesi gerekmez.
 *
 * Sahte bir çözümleyici DEĞİL, gerçeğinin kampanyasız hâlidir: ürünün kendi
 * indirim penceresi gerçek kuralla uygulanır, yalnız aktif kampanya listesi
 * boştur. Böylece fiyat davranışı testte de üretimdeki kodla ölçülür.
 *
 * @param campaigns Kampanya davranışı ölçülecekse yürürlükteki kodsuz indirimler.
 */
/**
 * Yürürlükteki kodsuz kampanya satırı — çözümleyicinin okuduğu alanların
 * tamamı varsayılanlı. Testler yalnız ölçtükleri alanı geçer.
 */
export const testCampaign = (
  overrides: Partial<{
    id: string;
    name: string;
    type: DiscountType;
    value: number;
    scope: DiscountScope;
    sellerId: string | null;
    categoryId: string | null;
    targetProductIds: string[];
    minCartValue: number | null;
    maxDiscountAmount: number | null;
  }> = {},
) => ({
  id: "campaign-1",
  name: "Kampanya",
  type: DiscountType.fixed_amount,
  value: 0,
  scope: DiscountScope.global,
  sellerId: null,
  categoryId: null,
  targetProductIds: [] as string[],
  minCartValue: null,
  maxDiscountAmount: null,
  ...overrides,
});

export interface TestPriceResolver extends ProductPriceResolver {
  /** Yürürlükteki kampanyaları test ortasında değiştirir (DI ile kurulmuş suite'ler için). */
  setCampaigns(campaigns: unknown[]): void;
}

export const testPriceResolver = (
  campaigns: unknown[] = [],
): TestPriceResolver => {
  let active = campaigns;
  const prisma = {
    discount: { findMany: async () => active },
    category: { findMany: async () => [] },
  } as any;
  const resolver = new ProductPriceResolver(
    prisma,
    new DiscountScopeService(prisma),
  ) as TestPriceResolver;
  resolver.setCampaigns = (next) => {
    active = next;
  };
  return resolver;
};
