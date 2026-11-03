import {
  BusinessStatus,
  MembershipTierType,
  SubscriptionStatus,
} from "@prisma/client";
import {
  installmentSegmentOf,
  type InstallmentSegmentBuyer,
} from "./installment-segment";

const DAY = 24 * 60 * 60 * 1000;

function buyer(
  tier: MembershipTierType | null,
  opts: {
    status?: SubscriptionStatus;
    periodEnd?: Date;
    corporate?: boolean;
    tierActive?: boolean;
  } = {},
): InstallmentSegmentBuyer {
  return {
    businessStatus: opts.corporate ? BusinessStatus.approved : null,
    companyName: opts.corporate ? "Model Arabalar AŞ" : null,
    taxId: opts.corporate ? "1234567890" : null,
    membership: tier
      ? {
          status: opts.status ?? SubscriptionStatus.active,
          currentPeriodEnd: opts.periodEnd ?? new Date(Date.now() + 10 * DAY),
          tier: { type: tier, isActive: opts.tierActive ?? true },
        }
      : null,
  };
}

describe("installmentSegmentOf (plan 4.6.1)", () => {
  it("is guest for a guest purchase, whatever tier the shared system account has", () => {
    expect(
      installmentSegmentOf({
        guest: true,
        buyer: buyer(MembershipTierType.premium),
      }),
    ).toBe("guest");
  });

  it("is guest when nobody is signed in", () => {
    expect(installmentSegmentOf({ guest: false, buyer: null })).toBe("guest");
  });

  it.each`
    case                                         | b                                                                               | segment
    ${"no membership row"}                       | ${buyer(null)}                                                                  | ${"free"}
    ${"free tier"}                               | ${buyer(MembershipTierType.free)}                                               | ${"free"}
    ${"basic, active"}                           | ${buyer(MembershipTierType.basic)}                                              | ${"basic"}
    ${"premium, active"}                         | ${buyer(MembershipTierType.premium)}                                            | ${"premium"}
    ${"premium, cancelled inside the period"}    | ${buyer(MembershipTierType.premium, { status: SubscriptionStatus.cancelled })}  | ${"premium"}
    ${"premium, period ended (expired -> free)"} | ${buyer(MembershipTierType.premium, { periodEnd: new Date(Date.now() - DAY) })} | ${"free"}
    ${"premium, payment not confirmed"}          | ${buyer(MembershipTierType.premium, { status: SubscriptionStatus.past_due })}   | ${"free"}
    ${"premium, status expired"}                 | ${buyer(MembershipTierType.premium, { status: SubscriptionStatus.expired })}    | ${"free"}
    ${"premium, tier switched off"}              | ${buyer(MembershipTierType.premium, { tierActive: false })}                     | ${"free"}
    ${"business with a corporate identity"}      | ${buyer(MembershipTierType.business, { corporate: true })}                      | ${"business"}
    ${"business without a corporate identity"}   | ${buyer(MembershipTierType.business)}                                           | ${"free"}
  `("$case -> $segment", ({ b, segment }) => {
    expect(installmentSegmentOf({ guest: false, buyer: b })).toBe(segment);
  });
});
