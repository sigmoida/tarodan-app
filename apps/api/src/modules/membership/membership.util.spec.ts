import {
  BusinessStatus,
  SubscriptionStatus,
  MembershipTierType,
} from "@prisma/client";
import { isPremiumEntitled } from "./membership.util";

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
