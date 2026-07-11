/**
 * checkout-3step · 3 adımlı ödeme akışının MOBİL-UI dilimleri.
 * J1 (üye satın alma akışı UI), J25, J54, J65.
 * Test edilen: adım butonu metni/durumu, fiyat özeti render, adım ilerleme/progress,
 * boş sepet durumu, step1 validasyon (snackbar) → ilerleme engeli.
 * Backend sipariş/ödeme oluşturma backend-only (handleCheckout) — test edilmez.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

// AsyncStorage native modülü test ortamında null; resmi jest mock'u kullan.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-router mock (login.test kalıbı)
jest.mock('expo-router', () => require('@/test-utils/router-mock').routerMock);

// API inline mock — ağ yok, deterministik. Checkout'un kullandığı tüm api'lar.
jest.mock('@/lib/api', () => ({
  ordersApi: { directBuy: jest.fn(), createGuest: jest.fn() },
  paymentsApi: {
    getPaymentMethods: jest.fn(() => Promise.resolve({ data: [] })),
    processDirect: jest.fn(),
    initiate: jest.fn(),
    initiateGuest: jest.fn(),
    bypassComplete: jest.fn(),
  },
  shippingApi: { getRatesByCity: jest.fn(() => Promise.resolve({ data: { rate: 34.9 } })) },
  addressesApi: { getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  discountsApi: { validate: jest.fn() },
}));

// Konuk akışı: misafir kullanıcı → adres formu inline görünür (testID gerektirmez).
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: false, user: null }),
}));

import { useCartStore } from '@/stores/cartStore';
import CheckoutScreen from '../index';

const seedCart = (items: any[]) => {
  useCartStore.setState({ items, lastUpdated: Date.now() });
};

const SAMPLE_ITEM = {
  id: 'cart-1',
  productId: 'prod-1234567890',
  title: 'Test Model Araba',
  price: 100,
  quantity: 1,
  imageUrl: 'https://x/y.jpg',
  brand: 'Bburago',
  scale: '1:18',
  seller: { id: 's1', displayName: 'Satıcı' },
  addedAt: Date.now(),
};

describe('checkout-3step', () => {
  afterEach(() => {
    useCartStore.setState({ items: [] });
  });

  describe('J1 · boş sepet durumu', () => {
    it('sepet boşsa boş ekran + Alışverişe Başla butonu', () => {
      seedCart([]);
      renderWithProviders(<CheckoutScreen />);
      expect(screen.getByText('Sepetiniz Boş')).toBeOnTheScreen();
      expect(screen.getByText('Alışverişe Başla')).toBeOnTheScreen();
    });
  });

  describe('J25 · adım 1 (Adres) başlangıç durumu', () => {
    it('ilk adımda buton "Devam Et" ve progress başlığı Teslimat Bilgileri', () => {
      seedCart([SAMPLE_ITEM]);
      renderWithProviders(<CheckoutScreen />);
      expect(screen.getByText('Devam Et')).toBeOnTheScreen();
      expect(screen.getByText('Teslimat Bilgileri')).toBeOnTheScreen();
    });

    it('fiyat özeti: ara toplam ürün adedi ile render edilir', () => {
      seedCart([SAMPLE_ITEM]);
      renderWithProviders(<CheckoutScreen />);
      expect(screen.getByText('Ara Toplam (1 ürün)')).toBeOnTheScreen();
      expect(screen.getByText('Ödeme Detayı')).toBeOnTheScreen();
    });

    it('il seçilmeden kargo satırı "İl seçin" gösterir', () => {
      seedCart([SAMPLE_ITEM]);
      renderWithProviders(<CheckoutScreen />);
      expect(screen.getByText('İl seçin')).toBeOnTheScreen();
    });
  });

  describe('J54 · adım 1 validasyon → ilerleme engeli', () => {
    it('konuk bilgileri boşken Devam Et hata snackbar gösterir, adım 2ye geçmez', async () => {
      seedCart([SAMPLE_ITEM]);
      renderWithProviders(<CheckoutScreen />);
      fireEvent.press(screen.getByText('Devam Et'));
      await waitFor(() =>
        expect(screen.getByText('Lütfen adınızı girin')).toBeOnTheScreen(),
      );
      // Hala step 1 → buton "Devam Et" kalır, "Devam" başlık aynı
      expect(screen.getByText('Devam Et')).toBeOnTheScreen();
    });
  });

  describe('J65 · adım ilerleme göstergesi (progress)', () => {
    it('3 adımlı progress etiketleri render edilir (Adres/Ödeme/Onay)', () => {
      seedCart([SAMPLE_ITEM]);
      renderWithProviders(<CheckoutScreen />);
      expect(screen.getByText('Adres')).toBeOnTheScreen();
      expect(screen.getByText('Ödeme')).toBeOnTheScreen();
      expect(screen.getByText('Onay')).toBeOnTheScreen();
    });

    it('toplam fiyat son adım butonunda formatlanır — başlangıçta Devam Et görünür', () => {
      seedCart([SAMPLE_ITEM]);
      renderWithProviders(<CheckoutScreen />);
      // İlk adımda son adım butonu (Onayla ve Öde) görünmez.
      expect(screen.queryByText(/Onayla ve Öde/)).toBeNull();
      expect(screen.getByText('Devam Et')).toBeOnTheScreen();
    });
  });
});
