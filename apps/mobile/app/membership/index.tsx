import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { api, membershipApi } from '../../src/services/api';

const TIER_ORDER = ['free', 'basic', 'premium', 'business'] as const;
type TierType = (typeof TIER_ORDER)[number];

const TIER_COLORS: Record<TierType, string> = {
  free: '#6B7280',
  basic: '#3B82F6',
  premium: '#8B5CF6',
  business: '#F59E0B',
};

const TIER_ICONS: Record<TierType, keyof typeof Ionicons.glyphMap> = {
  free: 'person-outline',
  basic: 'star-outline',
  premium: 'diamond-outline',
  business: 'briefcase-outline',
};

const TIER_FEATURES: Record<TierType, string[]> = {
  free: ['10 ilan', '5 resim', 'Temel arama', 'Sınırlı mesajlaşma'],
  basic: ['Admin ayarlı ilan limiti', '10 resim', 'Gelişmiş arama', 'Mesajlaşma'],
  premium: ['Sınırsız ilan', '15 resim', 'Öncelikli arama', 'Sınırsız mesajlaşma', 'Takas', 'Koleksiyon'],
  business: ['Sınırsız ilan', '20 resim', 'En yüksek öncelik', 'Sınırsız her şey', 'API erişimi'],
};

const TIER_NAMES: Record<TierType, string> = {
  free: 'Ücretsiz',
  basic: 'Temel',
  premium: 'Premium',
  business: 'Business',
};

interface MembershipDetails {
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

interface PlatformSettings {
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

export default function MembershipScreen() {
  const { isAuthenticated, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<MembershipDetails | null>(null);
  const [settings, setSettings] = useState<PlatformSettings>({});
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchData();
  }, [isAuthenticated]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [membershipRes, settingsRes] = await Promise.all([
        membershipApi.getCurrentMembership(),
        api.get('/admin/settings/public'),
      ]);
      setMembership(membershipRes.data);
      setSettings(settingsRes.data || {});
    } catch (err: any) {
      console.error('Failed to load membership data:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentTier: TierType = (membership?.tier?.type as TierType) || 'free';

  const getPrice = (tier: TierType): number => {
    if (tier === 'free') return 0;
    const key = `${tier}_${billingPeriod === 'monthly' ? 'monthly' : 'yearly'}_price` as keyof PlatformSettings;
    const price = settings[key] as number | undefined;
    if (price) return price;

    const monthlyKey = `${tier}_monthly_price` as keyof PlatformSettings;
    const monthlyPrice = (settings[monthlyKey] as number | undefined) ?? getDefaultMonthly(tier);
    if (billingPeriod === 'yearly') {
      const discount = settings.yearly_discount_percentage ?? 20;
      return Math.round(monthlyPrice * 12 * (1 - discount / 100));
    }
    return monthlyPrice;
  };

  const getDefaultMonthly = (tier: TierType): number => {
    switch (tier) {
      case 'basic': return 49;
      case 'premium': return 99;
      case 'business': return 499;
      default: return 0;
    }
  };

  const getListingLimit = (tier: TierType): string => {
    const key = `${tier}_listing_limit` as keyof PlatformSettings;
    const limit = settings[key] as number | undefined;
    if (limit === -1) return 'Sınırsız ilan';
    if (limit) return `${limit} ilan`;

    switch (tier) {
      case 'free': return '10 ilan';
      case 'basic': return `${settings.basic_listing_limit ?? 50} ilan`;
      case 'premium': return 'Sınırsız ilan';
      case 'business': return 'Sınırsız ilan';
      default: return '10 ilan';
    }
  };

  const getFeatures = (tier: TierType): string[] => {
    const base = [...TIER_FEATURES[tier]];
    if (tier !== 'free') {
      base[0] = getListingLimit(tier);
    }
    return base;
  };

  const tierIndex = (t: TierType) => TIER_ORDER.indexOf(t);

  const handleTierAction = (tier: TierType) => {
    if (tier === 'free' || tier === currentTier) return;
    if (tierIndex(tier) < tierIndex(currentTier)) {
      Alert.alert('Bilgi', 'Alt plana geçiş şu anda desteklenmiyor.');
      return;
    }
    router.push(`/membership/checkout?tier=${tier}&period=${billingPeriod}`);
  };

  const hasPendingPayment = !!membership?.pendingPayment;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Üyelik</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Üyelik</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Pending Payment Banner */}
        {hasPendingPayment && (
          <TouchableOpacity
            style={styles.pendingBanner}
            onPress={() =>
              router.push(
                `/membership/checkout?tier=${membership?.pendingPayment?.tierType || membership?.pendingTierType || 'premium'}&period=monthly`
              )
            }
          >
            <Ionicons name="warning" size={22} color="#92400E" />
            <View style={styles.pendingBannerText}>
              <Text style={styles.pendingTitle}>
                Ödeme Bekleniyor – {membership?.pendingPayment?.tierName || membership?.pendingTierName || 'Plan'}
              </Text>
              <Text style={styles.pendingSubtitle}>Ödemeyi tamamlamak için dokunun</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#92400E" />
          </TouchableOpacity>
        )}

        {/* Current Plan Summary */}
        <View style={styles.currentPlanCard}>
          <View style={[styles.currentPlanIcon, { backgroundColor: TIER_COLORS[currentTier] + '20' }]}>
            <Ionicons name={TIER_ICONS[currentTier]} size={28} color={TIER_COLORS[currentTier]} />
          </View>
          <Text style={styles.currentPlanLabel}>Mevcut Planınız</Text>
          <Text style={[styles.currentPlanName, { color: TIER_COLORS[currentTier] }]}>
            {TIER_NAMES[currentTier]}
          </Text>
          {membership?.currentPeriodEnd && currentTier !== 'free' && (
            <Text style={styles.currentPlanExpiry}>
              Yenilenme: {new Date(membership.currentPeriodEnd).toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          )}
        </View>

        {/* Billing Period Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, billingPeriod === 'monthly' && styles.toggleButtonActive]}
            onPress={() => setBillingPeriod('monthly')}
          >
            <Text style={[styles.toggleText, billingPeriod === 'monthly' && styles.toggleTextActive]}>Aylık</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, billingPeriod === 'yearly' && styles.toggleButtonActive]}
            onPress={() => setBillingPeriod('yearly')}
          >
            <Text style={[styles.toggleText, billingPeriod === 'yearly' && styles.toggleTextActive]}>Yıllık</Text>
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>%{settings.yearly_discount_percentage ?? 20} indirim</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tier Cards - Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tierCardsContainer}
          decelerationRate="fast"
          snapToInterval={280 + 12}
          snapToAlignment="start"
        >
          {TIER_ORDER.map((tier) => {
            const price = getPrice(tier);
            const isCurrent = tier === currentTier;
            const isUpgrade = tierIndex(tier) > tierIndex(currentTier);
            const color = TIER_COLORS[tier];
            const features = getFeatures(tier);

            return (
              <View key={tier} style={[styles.tierCard, isCurrent && { borderColor: color, borderWidth: 2 }]}>
                {/* Popular badge for premium */}
                {tier === 'premium' && (
                  <View style={[styles.popularBadge, { backgroundColor: color }]}>
                    <Text style={styles.popularBadgeText}>En Popüler</Text>
                  </View>
                )}

                {/* Current plan badge */}
                {isCurrent && (
                  <View style={[styles.currentBadge, { backgroundColor: color }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#FFF" />
                    <Text style={styles.currentBadgeText}>Mevcut Plan</Text>
                  </View>
                )}

                <View style={[styles.tierIconCircle, { backgroundColor: color + '15' }]}>
                  <Ionicons name={TIER_ICONS[tier]} size={24} color={color} />
                </View>

                <Text style={[styles.tierName, { color }]}>{TIER_NAMES[tier]}</Text>

                <View style={styles.tierPriceRow}>
                  {price === 0 ? (
                    <Text style={styles.tierPriceFree}>Ücretsiz</Text>
                  ) : (
                    <>
                      <Text style={styles.tierPrice}>{price.toLocaleString('tr-TR')} ₺</Text>
                      <Text style={styles.tierPricePeriod}>/{billingPeriod === 'monthly' ? 'ay' : 'yıl'}</Text>
                    </>
                  )}
                </View>

                {billingPeriod === 'yearly' && price > 0 && (
                  <Text style={styles.tierMonthlyEquiv}>
                    Aylık ~{Math.round(price / 12).toLocaleString('tr-TR')} ₺
                  </Text>
                )}

                <View style={styles.tierDivider} />

                <View style={styles.tierFeatures}>
                  {features.map((feat, idx) => (
                    <View key={idx} style={styles.tierFeatureRow}>
                      <Ionicons name="checkmark-circle" size={16} color={color} />
                      <Text style={styles.tierFeatureText}>{feat}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ flex: 1 }} />

                <TouchableOpacity
                  style={[
                    styles.tierButton,
                    isCurrent
                      ? { backgroundColor: color + '15', borderColor: color, borderWidth: 1 }
                      : isUpgrade
                        ? { backgroundColor: color }
                        : { backgroundColor: TarodanColors.backgroundTertiary },
                  ]}
                  onPress={() => handleTierAction(tier)}
                  disabled={isCurrent || tier === 'free'}
                >
                  <Text
                    style={[
                      styles.tierButtonText,
                      isCurrent
                        ? { color }
                        : isUpgrade
                          ? { color: '#FFF' }
                          : { color: TarodanColors.textTertiary },
                    ]}
                  >
                    {isCurrent ? 'Mevcut Plan' : isUpgrade ? 'Yükselt' : 'Mevcut'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.textOnPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },

  // Pending Payment Banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  pendingBannerText: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  pendingSubtitle: {
    fontSize: 12,
    color: '#A16207',
    marginTop: 2,
  },

  // Current Plan Card
  currentPlanCard: {
    backgroundColor: TarodanColors.background,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  currentPlanIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  currentPlanLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  currentPlanName: {
    fontSize: 22,
    fontWeight: '700',
  },
  currentPlanExpiry: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginTop: 6,
  },

  // Toggle
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.background,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  toggleButtonActive: {
    backgroundColor: TarodanColors.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
  },
  toggleTextActive: {
    color: '#FFF',
  },
  discountBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },

  // Tier Cards
  tierCardsContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 12,
  },
  tierCard: {
    width: 280,
    backgroundColor: TarodanColors.background,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 420,
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 12,
  },
  popularBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  currentBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopLeftRadius: 14,
    borderBottomRightRadius: 12,
  },
  currentBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  tierIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  tierPriceFree: {
    fontSize: 24,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  tierPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  tierPricePeriod: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginLeft: 2,
  },
  tierMonthlyEquiv: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginBottom: 2,
  },
  tierDivider: {
    height: 1,
    backgroundColor: TarodanColors.border,
    marginVertical: 14,
  },
  tierFeatures: {
    gap: 10,
  },
  tierFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierFeatureText: {
    fontSize: 13,
    color: TarodanColors.textPrimary,
    flex: 1,
  },
  tierButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  tierButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
