/**
 * Ürün detay (product/[id]) — kanonik refactor sonrası smoke/dilim testi.
 * Yükleniyor → ürün render (başlık/fiyat), bulunamadı durumu, alıcı aksiyonları.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../src/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({ id: 'p1' }),
}));

jest.mock('@/lib/api', () => ({
  productsApi: {
    getOne: jest.fn(),
    incrementView: jest.fn(() => Promise.resolve({ data: {} })),
    getMyById: jest.fn(),
  },
  ratingsApi: { getProductRatings: jest.fn(() => Promise.resolve({ data: { ratings: [] } })) },
  userReportsApi: { create: jest.fn() },
}));
import { productsApi } from '@/lib/api';

// Ağır child modaller test kapsamı dışı — izole et (ekranı test ediyoruz, çocuklarını değil).
jest.mock('@/components/product/MakeOfferModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/product/AddToCollectionModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/SignupPrompt', () => ({ SignupPrompt: () => null }));

let mockAuth = { isAuthenticated: false, user: null as { id: string } | null };
jest.mock('@/stores/authStore', () => ({ useAuthStore: () => mockAuth }));
jest.mock('@/stores/cartStore', () => ({
  useCartStore: () => ({ addItem: jest.fn(), isInCart: () => false, setBuyNow: jest.fn() }),
}));
jest.mock('@/stores/guestStore', () => ({
  useGuestStore: () => ({
    incrementProductView: jest.fn(),
    getPromptType: () => null,
    setLastPromptShown: jest.fn(),
    canShowPrompt: () => false,
  }),
}));
jest.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    addToFavorites: jest.fn(),
    removeFromFavorites: jest.fn(),
    isInFavorites: () => false,
    fetchFavorites: jest.fn(() => Promise.resolve()),
  }),
}));

import ProductDetailScreen from '../index';

const getOneMock = productsApi.getOne as jest.Mock;

function productFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    title: 'Vintage Model Araba',
    price: 1200,
    condition: 'good',
    status: 'active',
    availableQuantity: 3,
    images: [],
    seller: { id: 's1', displayName: 'Ali Veli' },
    createdAt: new Date('2025-01-01').toISOString(),
    ...overrides,
  };
}

describe('Ürün detay ekranı', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockAuth = { isAuthenticated: false, user: null };
  });

  it('ürünü render eder (başlık + alıcı aksiyonları)', async () => {
    getOneMock.mockResolvedValue({ data: { data: productFixture() } });
    renderWithProviders(<ProductDetailScreen />);

    await waitFor(() => expect(screen.getByText('Vintage Model Araba')).toBeOnTheScreen());
    expect(screen.getByTestId('product-detail-buy-now-button')).toBeOnTheScreen();
    expect(screen.getByTestId('product-detail-add-to-cart-button')).toBeOnTheScreen();
  });

  it('stokta yok üründe pasif buton gösterir', async () => {
    getOneMock.mockResolvedValue({
      data: { data: productFixture({ status: 'inactive', availableQuantity: 0 }) },
    });
    renderWithProviders(<ProductDetailScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('product-detail-out-of-stock-button')).toBeOnTheScreen(),
    );
  });

  it('ürün bulunamazsa boş durum gösterir', async () => {
    getOneMock.mockRejectedValue(new Error('404'));
    renderWithProviders(<ProductDetailScreen />);

    await waitFor(() => expect(screen.getByText('Ürün bulunamadı')).toBeOnTheScreen());
  });
});
