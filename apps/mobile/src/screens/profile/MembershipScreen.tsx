/**
 * Membership Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuthStore } from '../../stores/authStore';

const PLANS = [
  {
    id: 'free',
    name: 'Ücretsiz',
    price: 0,
    period: '',
    features: [
      { text: '5 aktif ilan', included: true },
      { text: 'Temel mesajlaşma', included: true },
      { text: 'Takas özelliği', included: true },
      { text: 'Standart destek', included: true },
      { text: 'Öne çıkarma', included: false },
      { text: 'İstatistikler', included: false },
      { text: 'Öncelikli destek', included: false },
    ],
    color: '#9E9E9E',
    popular: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 49.90,
    period: '/ay',
    features: [
      { text: '25 aktif ilan', included: true },
      { text: 'Gelişmiş mesajlaşma', included: true },
      { text: 'Takas özelliği', included: true },
      { text: 'E-posta desteği', included: true },
      { text: 'Aylık 3 öne çıkarma', included: true },
      { text: 'Temel istatistikler', included: true },
      { text: 'Öncelikli destek', included: false },
    ],
    color: '#E53935',
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 99.90,
    period: '/ay',
    features: [
      { text: 'Sınırsız ilan', included: true },
      { text: 'Premium mesajlaşma', included: true },
      { text: 'Takas özelliği', included: true },
      { text: 'Telefon desteği', included: true },
      { text: 'Sınırsız öne çıkarma', included: true },
      { text: 'Detaylı istatistikler', included: true },
      { text: 'Öncelikli destek', included: true },
    ],
    color: '#9C27B0',
    popular: false,
  },
];

const MembershipScreen = () => {
  const { user } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const currentPlan = user?.membership_type || 'free';

  const handleSelectPlan = (planId: string) => {
    if (planId === currentPlan) return;
    setSelectedPlan(planId);
  };

  const handleSubscribe = () => {
    if (!selectedPlan || selectedPlan === 'free') {
      Alert.alert('Bilgi', 'Ücretsiz plan varsayılan olarak aktiftir');
      return;
    }

    Alert.alert(
      'Abonelik',
      'Seçtiğiniz plana abone olmak için ödeme sayfasına yönlendirileceksiniz.',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Devam', onPress: () => {
          // Navigate to payment
        }},
      ]
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Current Plan */}
      <View style={styles.currentPlanCard}>
        <Text style={styles.currentPlanLabel}>Mevcut Planınız</Text>
        <Text style={styles.currentPlanName}>
          {PLANS.find(p => p.id === currentPlan)?.name || 'Ücretsiz'}
        </Text>
      </View>

      {/* Plans */}
      {PLANS.map((plan) => (
        <TouchableOpacity
          key={plan.id}
          style={[
            styles.planCard,
            (selectedPlan === plan.id || (!selectedPlan && currentPlan === plan.id)) && {
              borderColor: plan.color,
              borderWidth: 2,
            },
          ]}
          onPress={() => handleSelectPlan(plan.id)}
        >
          {plan.popular && (
            <View style={styles.popularBadge}>
              <Text style={styles.popularText}>EN POPÜLER</Text>
            </View>
          )}

          <View style={styles.planHeader}>
            <Text style={styles.planName}>{plan.name}</Text>
            <View style={styles.priceContainer}>
              {plan.price > 0 ? (
                <>
                  <Text style={[styles.planPrice, { color: plan.color }]}>
                    ₺{(plan.price ?? 0).toFixed(2)}
                  </Text>
                  <Text style={styles.planPeriod}>{plan.period}</Text>
                </>
              ) : (
                <Text style={styles.planPrice}>Ücretsiz</Text>
              )}
            </View>
          </View>

          <View style={styles.featuresList}>
            {plan.features.map((feature, index) => (
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

          {currentPlan === plan.id && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Aktif Plan</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      {/* Subscribe Button */}
      {selectedPlan && selectedPlan !== currentPlan && (
        <TouchableOpacity style={styles.subscribeButton} onPress={handleSubscribe}>
          <Text style={styles.subscribeButtonText}>
            {selectedPlan === 'free' ? 'Ücretsiz Plana Geç' : 'Abone Ol'}
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


