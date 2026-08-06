import type { AllocatedCoupon } from "../discount.service";

/**
 * Kupon uygulanmayan akışlar için asgari DiscountService sahtesi.
 *
 * Fiyatlama yolları kuponu TEK adımdan geçirir (`allocateCoupon`), bu yüzden
 * kuponu hiç ölçmeyen suite'lerin bile bu ucu tanıması gerekir. Her spec kendi
 * boş nesnesini yazmasın diye tek yerde durur.
 */
export const noCouponDiscountService = () =>
  ({
    allocateCoupon: async () => ({ coupon: null }),
    assertCouponUnchanged: () => {},
  }) as any;

/** Belirli bir kupon dağıtımını döndüren sahte — kupon davranışını ölçen suite'ler için. */
export const stubCouponDiscountService = (
  coupon: Partial<AllocatedCoupon> & Pick<AllocatedCoupon, "shares" | "total">,
) =>
  ({
    assertCouponUnchanged: () => {},
    allocateCoupon: async () => ({
      coupon: {
        discountId: "discount-1",
        code: "TEST",
        name: "Test kuponu",
        type: "fixed_amount",
        value: coupon.total,
        scope: "global",
        platformFundedShare: 0,
        eligibleProductIds: [],
        ...coupon,
      },
    }),
  }) as any;

/** Kuponu reddeden sahte — hata yolunu ölçen suite'ler için. */
export const rejectingCouponDiscountService = (error: string) =>
  ({
    allocateCoupon: async () => ({ coupon: null, error }),
    assertCouponUnchanged: () => {},
  }) as any;
