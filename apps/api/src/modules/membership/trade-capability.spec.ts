import { BusinessStatus, MembershipTierType } from "@prisma/client";
import {
  canTradeFromMembership,
  tradeCapableSellerWhere,
} from "./membership.util";

/**
 * Takas ÜCRETLİ bir üyelik özelliği (`MembershipTier.canTrade`; ücretsiz
 * katmanda varsayılan false). Ürünün `isTradeEnabled` bayrağı satıcının
 * NİYETİDİR — yetki değildir. Üyelik bitince kullanıcı ücretsize düşer ve
 * yetkisini kaybeder, ama bayrak üründe kalır; bu iki kaynak ayrıştığında
 * pazaryeri sahibinin kabul edemeyeceği ilanları "takasa açık" diye
 * listeliyordu.
 *
 * Bu yüzden EFEKTİF yetki tek bir yerden türetilir ve üç katman (takas sınır
 * denetimi, Postgres liste filtresi, arama dokümanı) aynı fonksiyonu kullanır.
 */
describe("canTradeFromMembership", () => {
  const future = new Date(Date.now() + 7 * 24 * 3600_000);
  const past = new Date(Date.now() - 24 * 3600_000);

  const paid = (over: Record<string, unknown> = {}) => ({
    status: "active",
    currentPeriodEnd: future,
    tier: { type: MembershipTierType.premium, isActive: true, canTrade: true },
    ...over,
  });

  it("geçerli ücretli üyelik + katmanda takas açık → yetkili", () => {
    expect(canTradeFromMembership(paid(), null, false)).toBe(true);
  });

  it("süresi dolmuş ücretli üyelik → ücretsiz katmanın bayrağına düşer", () => {
    const lapsed = paid({ currentPeriodEnd: past });
    expect(canTradeFromMembership(lapsed, null, false)).toBe(false);
    // Admin ücretsiz katmanda takası açarsa herkes yetkili olur.
    expect(canTradeFromMembership(lapsed, null, true)).toBe(true);
  });

  it("katmanında takas kapalıysa geçerli üyelik de yetki vermez", () => {
    const noTrade = paid({
      tier: {
        type: MembershipTierType.premium,
        isActive: true,
        canTrade: false,
      },
    });
    expect(canTradeFromMembership(noTrade, null, false)).toBe(false);
  });

  it("ücretsiz katmandaki kullanıcı doğrudan kendi katman bayrağını kullanır", () => {
    const free = {
      status: "active",
      currentPeriodEnd: future,
      tier: { type: MembershipTierType.free, isActive: true, canTrade: false },
    };
    expect(canTradeFromMembership(free, null, false)).toBe(false);
    const freeOpen = {
      ...free,
      tier: { ...free.tier, canTrade: true },
    };
    expect(canTradeFromMembership(freeOpen, null, true)).toBe(true);
  });

  it("business katmanı şirket onayı beklerken yetkili DEĞİL", () => {
    const business = paid({
      tier: {
        type: MembershipTierType.business,
        isActive: true,
        canTrade: true,
      },
    });
    expect(
      canTradeFromMembership(business, { businessStatus: "pending" }, false),
    ).toBe(false);
    expect(
      canTradeFromMembership(
        business,
        {
          businessStatus: BusinessStatus.approved,
          companyName: "Tarodan A.Ş.",
          taxId: "1234567890",
        },
        false,
      ),
    ).toBe(true);
  });

  it("üyeliği hiç olmayan kullanıcı ücretsiz katman bayrağını alır", () => {
    expect(canTradeFromMembership(null, null, false)).toBe(false);
    expect(canTradeFromMembership(null, null, true)).toBe(true);
  });
});

describe("tradeCapableSellerWhere", () => {
  it("ücretsiz katmanda takas açıkken filtre GEREKMEZ (herkes yetkili)", () => {
    expect(tradeCapableSellerWhere(true)).toBeUndefined();
  });

  it("ücretsiz katman kapalıyken geçerli+takas-açık üyelik şartı üretir", () => {
    const where = tradeCapableSellerWhere(false);
    expect(where).toBeDefined();
    // Prisma fragment'ı User üzerinden membership'e iner ve katman bayrağını arar.
    const json = JSON.stringify(where);
    expect(json).toContain("membership");
    expect(json).toContain("canTrade");
    expect(json).toContain("currentPeriodEnd");
  });
});
