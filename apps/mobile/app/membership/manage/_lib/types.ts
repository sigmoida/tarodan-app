export interface MembershipMe {
  tier?: { type?: string; name?: string };
  tierType?: string;
  tierName?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextBillingDate?: string;
  nextBillingAmount?: number;
  autoRenew?: boolean;
  status?: string;
}

export const TIER_NAMES: Record<string, string> = {
  free: 'Ücretsiz Üyelik',
  basic: 'Temel Üyelik',
  premium: 'Premium Üyelik',
  business: 'Business Üyelik',
};
