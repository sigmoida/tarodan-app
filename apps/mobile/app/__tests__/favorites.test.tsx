/**
 * J57 · favori listesi ekranı: misafir CTA, boş durum, dolu liste render.
 * J21 · favoriden çıkar butonu (handleRemove → removeFromFavorites çağrısı).
 * Sadece MOBİL-UI: render/durum gösterimi + navigasyon wiring.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../src/test-utils';
import { pushMock, resetRouterMocks } from '../../src/test-utils/router-mock';

jest.mock('expo-router', () => {
  const rm = require('../../src/test-utils/router-mock').routerMock;
  return { ...rm, useFocusEffect: (cb: any) => cb() };
});

const mockState = {
  isAuthenticated: true,
  items: [] as any[],
  fetchFavorites: jest.fn(),
  removeFromFavorites: jest.fn().mockResolvedValue(true),
  addItem: jest.fn(),
};

jest.mock('../../src/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockState.isAuthenticated }),
}));

jest.mock('../../src/stores/favoritesStore', () => ({
  useFavoritesStore: () => ({
    items: mockState.items,
    isLoading: false,
    error: null,
    fetchFavorites: mockState.fetchFavorites,
    removeFromFavorites: mockState.removeFromFavorites,
    getFavoriteCount: () => mockState.items.length,
  }),
}));

jest.mock('../../src/stores/cartStore', () => ({
  useCartStore: () => ({ addItem: mockState.addItem }),
}));

import FavoritesScreen from '../favorites';

const makeItem = (productId: string, title = 'Hot Wheels') => ({
  id: `id-${productId}`,
  productId,
  product: {
    id: productId,
    title,
    price: 250,
    images: [],
    condition: 'good',
    status: 'active',
    seller: { id: 's1', displayName: 'Satıcı X' },
  },
  addedAt: new Date().toISOString(),
});

beforeEach(() => {
  resetRouterMocks();
  mockState.fetchFavorites.mockClear();
  mockState.removeFromFavorites.mockClear();
  mockState.addItem.mockClear();
  mockState.isAuthenticated = true;
  mockState.items = [];
});

describe('J57 · favoriler ekranı — misafir', () => {
  it('giriş yapılmamışsa giriş CTA gösterir ve butona basınca login push', () => {
    mockState.isAuthenticated = false;
    renderWithProviders(<FavoritesScreen />);
    expect(screen.getByText('Favorilerinizi görmek için giriş yapın')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Giriş Yap'));
    expect(pushMock).toHaveBeenCalledWith('/(auth)/login');
  });
});

describe('J57 · favoriler ekranı — boş durum', () => {
  it('liste boşken boş durum metni ve keşfet butonu görünür', () => {
    mockState.items = [];
    renderWithProviders(<FavoritesScreen />);
    expect(screen.getByText('Henüz favori yok')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Ürünleri Keşfet'));
    expect(pushMock).toHaveBeenCalledWith('/(tabs)/search');
  });
});

describe('J57 · favoriler ekranı — dolu liste', () => {
  it('ürün başlığı/satıcı/sayaç başlık render edilir', () => {
    mockState.items = [makeItem('p1', 'Mustang 1967'), makeItem('p2', 'Camaro')];
    renderWithProviders(<FavoritesScreen />);
    expect(screen.getByText('Mustang 1967')).toBeOnTheScreen();
    expect(screen.getByText('Camaro')).toBeOnTheScreen();
    expect(screen.getByText('Favorilerim (2)')).toBeOnTheScreen();
  });

  it('J21 · favoriden çıkar butonu removeFromFavorites çağırır', () => {
    mockState.items = [makeItem('p1')];
    renderWithProviders(<FavoritesScreen />);
    fireEvent.press(screen.getByLabelText('Favorilerden çıkar'));
    expect(mockState.removeFromFavorites).toHaveBeenCalledWith('p1');
  });

  it('ürün kartına dokununca ürün detayına push eder', () => {
    mockState.items = [makeItem('p1')];
    renderWithProviders(<FavoritesScreen />);
    fireEvent.press(screen.getByText('Hot Wheels'));
    expect(pushMock).toHaveBeenCalledWith('/product/p1');
  });
});
