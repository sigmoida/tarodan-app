import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

export const TIER_ORDER = ['free', 'basic', 'premium', 'business'] as const;
export type TierType = (typeof TIER_ORDER)[number];

export const TIER_COLORS: Record<TierType, string> = {
  free: colors.gray[500]!,
  basic: colors.info[600]!,
  premium: colors.primary[600]!,
  business: colors.warning[500]!,
};

export const TIER_ICONS: Record<TierType, keyof typeof Ionicons.glyphMap> = {
  free: 'person-outline',
  basic: 'star-outline',
  premium: 'diamond-outline',
  business: 'briefcase-outline',
};

export const TIER_FEATURES: Record<TierType, string[]> = {
  free: ['10 ilan', '5 resim', 'Temel arama', 'Sınırlı mesajlaşma'],
  basic: ['Admin ayarlı ilan limiti', '10 resim', 'Gelişmiş arama', 'Mesajlaşma'],
  premium: ['Sınırsız ilan', '15 resim', 'Öncelikli arama', 'Sınırsız mesajlaşma', 'Takas', 'Koleksiyon'],
  business: ['Sınırsız ilan', '20 resim', 'En yüksek öncelik', 'Sınırsız her şey', 'API erişimi'],
};

export const TIER_NAMES: Record<TierType, string> = {
  free: 'Ücretsiz',
  basic: 'Temel',
  premium: 'Premium',
  business: 'Business',
};

// Fiyatları her zaman 2 ondalıkla göster (admin paneliyle birebir aynı biçim).
// Ham hesap artığı 3 ondalığı (örn. 419,916) ve kademeler arası ondalık/tam-sayı
// tutarsızlığını (419,916 vs 832) önler → "419,92", "839,92".
export const formatTL = (n: number): string =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface MembershipDetails {
  tier?: { type: string; name: string };
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  pendingPayment?: {
    id: string;
    tierType: string;
    tierName: string;
  } | null;
  pendingTierName?: string;
  pendingTierType?: string;
}

export interface PlatformSettings {
  free_listing_limit?: number;
  basic_listing_limit?: number;
  premium_listing_limit?: number;
  business_listing_limit?: number;
  basic_monthly_price?: number;
  basic_yearly_price?: number;
  premium_monthly_price?: number;
  premium_yearly_price?: number;
  business_monthly_price?: number;
  business_yearly_price?: number;
  yearly_discount_percentage?: number;
}

// GET /membership/tiers (DB MembershipTier) yanıtını ekranın beklediği
// PlatformSettings şekline çevirir — böylece getPrice/getListingLimit aynen kalır.
// Web profile/membership ile aynı eşleme.
export function mapTiersToSettings(list: any[]): PlatformSettings {
  const by = (type: string) => (Array.isArray(list) ? list.find((x) => x?.type === type) : undefined);
  const num = (v: any): number | undefined => (v === undefined || v === null ? undefined : Number(v));
  const free = by('free');
  const basic = by('basic');
  const premium = by('premium');
  const business = by('business');
  // Yıllık indirim %'sini premium tier fiyatından türet (monthly*12 vs yearly).
  const pm = num(premium?.monthlyPrice);
  const py = num(premium?.yearlyPrice);
  const pct = pm && py && pm * 12 > 0 ? Math.round((1 - py / (pm * 12)) * 100) : undefined;
  return {
    free_listing_limit: num(free?.maxTotalListings),
    basic_listing_limit: num(basic?.maxTotalListings),
    premium_listing_limit: num(premium?.maxTotalListings),
    business_listing_limit: num(business?.maxTotalListings),
    basic_monthly_price: num(basic?.monthlyPrice),
    basic_yearly_price: num(basic?.yearlyPrice),
    premium_monthly_price: pm,
    premium_yearly_price: py,
    business_monthly_price: num(business?.monthlyPrice),
    business_yearly_price: num(business?.yearlyPrice),
    yearly_discount_percentage: pct ?? 20,
  };
}

// Son çare fallback (yalnız getTiers API'si tamamen erişilemezse) — DB
// MembershipTier seed değerleriyle ve checkout.tsx DEFAULT_MONTHLY ile hizalı.
// Gerçek fiyat/indirim her zaman canlı getTiers'tan gelir; bu sabitler
// yalnız ağ hatasında devreye girer.
export const getDefaultMonthly = (tier: TierType): number => {
  switch (tier) {
    case 'basic': return 49.99;
    case 'premium': return 99.99;
    case 'business': return 249.99;
    default: return 0;
  }
};
