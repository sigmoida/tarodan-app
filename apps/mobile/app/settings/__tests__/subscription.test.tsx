/**
 * J107 · Abonelik ayarları ekranı UI dilimleri.
 * J108 · İptal butonu görünürlüğü (premium aktif → "Aboneliği İptal Et",
 *        iptal edilmiş → "Yeniden Aktifleştir").
 * Yalnız MOBİL-UI: render durumları, buton/aksiyon görünürlüğü, misafir gate,
 * navigasyon wiring. Backend abonelik (tahsilat/webhook) backendOnly.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';
import { resetRouterMocks, pushMock } from '../../../src/test-utils/router-mock';

jest.mock('expo-router', () => {
  const rm = require('../../../src/test-utils/router-mock').routerMock;
  return { ...rm, useFocusEffect: (cb: any) => cb() };
});

jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// authStore — varsayılan: oturum açık. Test içinde override edilebilir.
let mockAuthState = { isAuthenticated: true };
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => mockAuthState,
}));

// subscriptionStore — saf yardımcıları KORU, yalnız hook'u (store) mock'la.
let mockStoreState: any;
jest.mock('../../../src/stores/subscriptionStore', () => {
  const actual = jest.requireActual('../../../src/stores/subscriptionStore');
  return {
    ...actual,
    useSubscriptionStore: () => mockStoreState,
  };
});

import SubscriptionSettingsScreen from '../subscription';

const baseStore = () => ({
  subscription: null,
  billingHistory: [],
  isLoading: false,
  error: null,
  fetchSubscription: jest.fn(),
  fetchBillingHistory: jest.fn(),
  cancelSubscription: jest.fn().mockResolvedValue(undefined),
  reactivateSubscription: jest.fn().mockResolvedValue(undefined),
  clearError: jest.fn(),
});

const activePremiumSub = {
  id: 's1',
  userId: 'u1',
  tierId: 'premium',
  tier: { type: 'premium' },
  status: 'active',
  billingPeriod: 'monthly',
  currentPeriodStart: new Date(Date.now() - 86400000).toISOString(),
  currentPeriodEnd: new Date(Date.now() + 10 * 86400000).toISOString(),
  cancelledAt: null,
  createdAt: new Date().toISOString(),
};

describe('J107 · abonelik ayarları (settings/subscription)', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockAuthState = { isAuthenticated: true };
    mockStoreState = baseStore();
  });

  it('misafir (oturum kapalı) → giriş yap gate gösterir', () => {
    mockAuthState = { isAuthenticated: false };
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(screen.getByText('Giriş Yapın')).toBeOnTheScreen();
  });

  it('ücretsiz kullanıcı → "Premium\'a Yükselt" CTA gösterir', () => {
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(screen.getByText("Premium'a Yükselt")).toBeOnTheScreen();
  });

  it('regresyon: AKTİF ücretsiz üyelik premium gibi gösterilmemeli', () => {
    // Backend her kullanıcıya status=active bir ücretsiz üyelik açar (~100 yıl
    // geçerli). Eskiden isPremium yalnız isSubscriptionActive'e bakıyordu; bu
    // yüzden ücretsiz kullanıcılar bile "Premium Üyelik" görüyordu. Artık tier
    // tipi de kontrol edildiği için ücretsiz üyelik premium sayılmamalı.
    mockStoreState = {
      ...baseStore(),
      subscription: {
        ...activePremiumSub,
        tierId: 'free',
        tier: { type: 'free', name: 'Ücretsiz Üyelik' },
        currentPeriodEnd: new Date(Date.now() + 365 * 86400000).toISOString(),
      },
    };
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(screen.getByText('Ücretsiz Üyelik')).toBeOnTheScreen();
    expect(screen.getByText("Premium'a Yükselt")).toBeOnTheScreen();
    // Premium'a özel aksiyonlar görünmemeli
    expect(screen.queryByText('Aboneliği İptal Et')).toBeNull();
  });

  it('J108.1 premium aktif → "Aboneliği İptal Et" görünür', () => {
    mockStoreState = { ...baseStore(), subscription: activePremiumSub };
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(screen.getByText('Aboneliği İptal Et')).toBeOnTheScreen();
    expect(screen.getByText('Premium Üyelik')).toBeOnTheScreen();
  });

  it('J108.2 iptal edilmiş (dönem içi) abonelik → downgrade uyarısı gösterir, iptal butonu yok', () => {
    // Ekran mantığı: isPremium = active && dönem sonu gelecekte. cancelled status
    // active olmadığından premium aksiyon kartı render edilmez; bunun yerine
    // dönem sonu uyarısı gösterilir.
    mockStoreState = {
      ...baseStore(),
      subscription: { ...activePremiumSub, status: 'cancelled' },
    };
    renderWithProviders(<SubscriptionSettingsScreen />);
    expect(screen.getByText(/gün sonra sona erecek/)).toBeOnTheScreen();
    expect(screen.queryByText('Aboneliği İptal Et')).toBeNull();
  });

  it('ücretsiz CTA → /upgrade ekranına yönlendirir', () => {
    renderWithProviders(<SubscriptionSettingsScreen />);
    fireEvent.press(screen.getByText("Premium'a Yükselt"));
    expect(pushMock).toHaveBeenCalledWith('/upgrade');
  });
});
