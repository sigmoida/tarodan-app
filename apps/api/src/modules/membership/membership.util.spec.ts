import {
  BusinessStatus,
  SubscriptionStatus,
  MembershipTierType,
} from "@prisma/client";
import {
  canSellFromMembership,
  isCorporateSellingSuspended,
  isPremiumEntitled,
  saleCapableSellerWhere,
} from "./membership.util";

/**
 * Premium hakkı tek doğruluk kaynağı. Kapılar (takas, sıralama, profil güven puanı,
 * boost auto-renew) bu fonksiyona bağlı — davranışını kilitle.
 */
describe("isPremiumEntitled", () => {
  const future = new Date(Date.now() + 10 * 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  const paid = { type: MembershipTierType.premium };
  const free = { type: MembershipTierType.free };

  it("active + ücretli + dönem gelecekte → true", () => {
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.active,
        currentPeriodEnd: future,
        tier: paid,
      }),
    ).toBe(true);
  });

  it("cancelled + dönem gelecekte → true (süre bitene kadar premium)", () => {
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.cancelled,
        currentPeriodEnd: future,
        tier: paid,
      }),
    ).toBe(true);
  });

  it("cancelled + dönem geçmişte → false", () => {
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.cancelled,
        currentPeriodEnd: past,
        tier: paid,
      }),
    ).toBe(false);
  });

  it("past_due (ödeme onaylanmamış) + dönem gelecekte → false", () => {
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.past_due,
        currentPeriodEnd: future,
        tier: paid,
      }),
    ).toBe(false);
  });

  it("expired → false", () => {
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.expired,
        currentPeriodEnd: future,
        tier: paid,
      }),
    ).toBe(false);
  });

  it("free tier → false (durum aktif olsa bile)", () => {
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.active,
        currentPeriodEnd: future,
        tier: free,
      }),
    ).toBe(false);
  });

  it("null / eksik alanlar → false", () => {
    expect(isPremiumEntitled(null)).toBe(false);
    expect(isPremiumEntitled(undefined)).toBe(false);
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.active,
        currentPeriodEnd: null,
        tier: paid,
      }),
    ).toBe(false);
    expect(
      isPremiumEntitled({
        status: SubscriptionStatus.active,
        currentPeriodEnd: future,
        tier: null,
      }),
    ).toBe(false);
  });

  it("business tier yalnız onaylı ve kimliği tam kurumsal hesaba hak verir", () => {
    const business = { type: MembershipTierType.business, isActive: true };
    const membership = {
      status: SubscriptionStatus.active,
      currentPeriodEnd: future,
      tier: business,
    };

    expect(
      isPremiumEntitled(membership, {
        businessStatus: BusinessStatus.approved,
        companyName: "Acme A.S.",
        taxId: "1234567890",
      }),
    ).toBe(true);
    expect(
      isPremiumEntitled(membership, {
        businessStatus: BusinessStatus.pending,
        companyName: "Acme A.S.",
        taxId: "1234567890",
      }),
    ).toBe(false);
    expect(
      isPremiumEntitled(membership, {
        businessStatus: BusinessStatus.approved,
        companyName: "Acme A.S.",
        taxId: null,
      }),
    ).toBe(false);
  });
});

describe("corporate selling suspension", () => {
  const owner = {
    businessStatus: BusinessStatus.approved,
    companyName: "Acme A.S.",
    taxId: "1234567890",
  };

  it("suspends selling when the BUSINESS period expires and restores it on renewal", () => {
    const expired = {
      status: SubscriptionStatus.active,
      currentPeriodEnd: new Date(Date.now() - 1000),
      tier: { type: MembershipTierType.business, isActive: true },
    };
    const renewed = {
      ...expired,
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    };

    expect(isCorporateSellingSuspended(expired, owner)).toBe(true);
    expect(isCorporateSellingSuspended(renewed, owner)).toBe(false);
  });

  it("does not apply corporate suspension to an individual seller", () => {
    expect(isCorporateSellingSuspended(null, null)).toBe(false);
  });

  it("keeps individual sellers eligible but requires live BUSINESS for corporate sellers", () => {
    const expired = {
      status: SubscriptionStatus.active,
      currentPeriodEnd: new Date(Date.now() - 1000),
      tier: { type: MembershipTierType.business, isActive: true },
    };
    const renewed = {
      ...expired,
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    };

    expect(canSellFromMembership(null, { businessStatus: null })).toBe(true);
    expect(canSellFromMembership(expired, owner)).toBe(false);
    expect(canSellFromMembership(renewed, owner)).toBe(true);
    expect(
      canSellFromMembership(renewed, {
        ...owner,
        businessStatus: BusinessStatus.pending,
      }),
    ).toBe(false);
  });

  it("builds a fail-closed public catalog predicate", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    expect(saleCapableSellerWhere(now)).toMatchObject({
      OR: [
        { businessStatus: null },
        {
          businessStatus: BusinessStatus.approved,
          membership: {
            currentPeriodEnd: { gt: now },
            tier: { type: MembershipTierType.business, isActive: true },
          },
        },
      ],
    });
  });
});
