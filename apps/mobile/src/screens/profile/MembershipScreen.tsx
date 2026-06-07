/**
 * Membership Screen — gerçek tier'lar + abonelik (ödeme yönlendirmesiyle)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { membershipApi } from '../../services/api';

const TIER_COLORS: Record<string, string> = {
  free: '#9E9E9E',
  basic: '#2196F3',
  premium: '#E53935',
  business: '#9C27B0',
};

// Tier flag'lerinden özellik listesi üret
const buildFeatures = (tier: any): { text: string; included: boolean }[] => {
  const maxTotal = tier?.maxTotalListings;
  const listingText =
    maxTotal === -1 || maxTotal == null
      ? 'Sınırsız ilan'
      : `${maxTotal} aktif ilan`;
  const slots = tier?.featuredListingSlots ?? 0;
  return [
    { text: listingText, included: true },
    { text: 'Mesajlaşma', included: true },
    { text: 'Takas özelliği', included: !!tier?.canTrade },
    { text: 'Koleksiyon oluşturma', included: !!tier?.canCreateCollections },
    {
      text: slots > 0 ? `${slots} öne çıkarma hakkı` : 'Öne çıkarma',
      included: slots > 0,
    },
    { text: 'Reklamsız', included: !!tier?.isAdFree },
  ];
};

const MembershipScreen = () => {
  const [tiers, setTiers] = useState<any[]>([]);
  const [currentTierType, setCurrentTierType] = useState<string>('free');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [autoRenew, setAutoRenew] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      membershipApi.getTiers().catch(() => null),
      membershipApi.getCurrentMembership().catch(() => null),
    ])
      .then(([tiersRes, meRes]) => {
        if (!active) return;
        const rawTiers = tiersRes?.data?.data ?? tiersRes?.data ?? [];
        const list = (Array.isArray(rawTiers) ? rawTiers : []).filter(
          (t: any) => t?.isActive !== false,
        );
        list.sort((a: any, b: any) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0));
        setTiers(list);
        const me = meRes?.data;
        setCurrentTierType(me?.tierType ?? me?.tier?.type ?? 'free');
        setAutoRenew(!!me?.autoRenew);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const handleSelect = (tierType: string) => {
    if (tierType === currentTierType) return;
    setSelectedType(tierType);
  };

  const handleSubscribe = async () => {
    if (!selectedType) return;
    if (selectedType === 'free') {
      Alert.alert('Bilgi', 'Ücretsiz plan varsayılan olarak aktiftir.');
      return;
    }
    setSubscribing(true);
    try {
      const res = await membershipApi.subscribe({
        tierType: selectedType,
        billingPeriod: 'monthly',
      });
      const paymentUrl = res?.data?.paymentUrl;
      if (paymentUrl && String(paymentUrl).startsWith('http')) {
        await Linking.openURL(paymentUrl);
      } else {
        Alert.alert('Bilgi', 'Üyelik güncellendi.');
      }
    } catch (error: any) {
      Alert.alert(
        'Hata',
        error?.response?.data?.message || 'Abonelik başlatılamadı',
      );
    } finally {
      setSubscribing(false);
    }
  };

  const handleToggleAutoRenew = async (value: boolean) => {
    setAutoRenew(value);
    try {
      await membershipApi.toggleAutoRenew(value);
    } catch {
      setAutoRenew(!value);
      Alert.alert('Hata', 'İşlem başarısız');
    }
  };

  const priceOf = (tier: any) => Number(tier?.monthlyPrice ?? 0);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  const currentTier = tiers.find((t) => t.type === currentTierType);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Current Plan */}
      <View style={styles.currentPlanCard}>
        <Text style={styles.currentPlanLabel}>Mevcut Planınız</Text>
        <Text style={styles.currentPlanName}>
          {currentTier?.name ||
            (currentTierType === 'free' ? 'Ücretsiz' : currentTierType)}
        </Text>
      </View>

      {/* Otomatik yenileme hatırlatması (ücretli üyelikte) */}
      {currentTierType !== 'free' && (
        <View style={styles.autoRenewCard}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.autoRenewTitle}>Otomatik Yenileme</Text>
            <Text style={styles.autoRenewDesc}>
              Açıkken üyelik bitiminde kayıtlı kartından (aylık/yıllık) otomatik yenilenir.
              Kapatırsan çekim yapılmaz.
            </Text>
          </View>
          <Switch value={autoRenew} onValueChange={handleToggleAutoRenew} />
        </View>
      )}

      {/* Plans */}
      {tiers.map((tier) => {
        const color = TIER_COLORS[tier.type] || '#9E9E9E';
        const price = priceOf(tier);
        const isSelected =
          selectedType === tier.type ||
          (!selectedType && currentTierType === tier.type);
        const features = buildFeatures(tier);
        return (
          <TouchableOpacity
            key={tier.type}
            style={[
              styles.planCard,
              isSelected && { borderColor: color, borderWidth: 2 },
            ]}
            onPress={() => handleSelect(tier.type)}
          >
            {tier.type === 'premium' && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularText}>EN POPÜLER</Text>
              </View>
            )}

            <View style={styles.planHeader}>
              <Text style={styles.planName}>{tier.name}</Text>
              <View style={styles.priceContainer}>
                {price > 0 ? (
                  <>
                    <Text style={[styles.planPrice, { color }]}>
                      ₺{price.toFixed(2)}
                    </Text>
                    <Text style={styles.planPeriod}>/ay</Text>
                  </>
                ) : (
                  <Text style={styles.planPrice}>Ücretsiz</Text>
                )}
              </View>
            </View>

            <View style={styles.featuresList}>
              {features.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <Icon
                    name={feature.included ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={feature.included ? '#4CAF50' : '#BDBDBD'}
                  />
                  <Text
                    style={[
                      styles.featureText,
                      !feature.included && styles.featureTextDisabled,
                    ]}
                  >
                    {feature.text}
                  </Text>
                </View>
              ))}
            </View>

            {currentTierType === tier.type && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Aktif Plan</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {/* Subscribe Button */}
      {selectedType && selectedType !== currentTierType && (
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handleSubscribe}
          disabled={subscribing}
        >
          <Text style={styles.subscribeButtonText}>
            {subscribing
              ? 'Yönlendiriliyor...'
              : selectedType === 'free'
                ? 'Ücretsiz Plana Geç'
                : 'Abone Ol ve Öde'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    padding: 16,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentPlanCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  currentPlanLabel: {
    fontSize: 14,
    color: '#757575',
  },
  currentPlanName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    marginTop: 4,
  },
  autoRenewCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  autoRenewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  autoRenewDesc: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  planCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    position: 'relative',
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#E53935',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: 12,
  },
  popularText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  planName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#212121',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
  },
  planPeriod: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 2,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    color: '#424242',
    marginLeft: 10,
  },
  featureTextDisabled: {
    color: '#BDBDBD',
  },
  currentBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#E8F5E9',
    paddingVertical: 8,
    alignItems: 'center',
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  subscribeButton: {
    backgroundColor: '#E53935',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  subscribeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default MembershipScreen;
