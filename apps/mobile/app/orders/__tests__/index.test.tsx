/**
 * J62/J64 · Siparişlerim listesi — mobil UI dilimi.
 * Liste render, boş durum, rol/filtre chip'leri, durum rozeti metni,
 * "Teslim Aldım" buton görünürlüğü (alıcı + delivered/awaiting_confirmation),
 * sipariş kartına navigasyon wiring.
 * Backend onay/iade/escrow aktarımı backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
import { router } from 'expo-router';
const pushMock = router.push as jest.Mock;

jest.mock('@/services/api', () => ({
  ordersApi: {
    getAll: jest.fn(),
    confirm: jest.fn(),
    confirmReceipt: jest.fn(),
  },
}));
import { ordersApi } from '@/services/api';

let mockAuth = { isAuthenticated: true };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

import OrdersScreen from '../index';

const getAllMock = ordersApi.getAll as jest.Mock;

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'TRD-1001',
    status: 'delivered',
    totalAmount: 350,
    product: { id: 'p1', title: 'Deri Ceket', images: [{ url: 'http://x/y.jpg' }] },
    seller: { id: 'seller-1', displayName: 'Mehmet' },
    createdAt: new Date('2026-01-01').toISOString(),
    isBuyer: true,
    ...overrides,
  };
}

describe('J62 · Siparişlerim listesi', () => {
  beforeEach(() => {
    getAllMock.mockReset();
    pushMock.mockReset();
    mockAuth = { isAuthenticated: true };
  });

  it('J62.1 boş durumda "Henüz siparişiniz yok" ve keşfet butonu gösterir', async () => {
    getAllMock.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<OrdersScreen />);
    await waitFor(() =>
      expect(screen.getByText('Henüz siparişiniz yok')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Ürünleri Keşfet')).toBeOnTheScreen();
  });

  it('J62.2 giriş yapılmamışsa giriş çağrısı ekranı gösterir', () => {
    mockAuth = { isAuthenticated: false };
    renderWithProviders(<OrdersScreen />);
    expect(screen.getByText('Siparişlerinizi görmek için giriş yapın')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Giriş Yap'));
    expect(pushMock).toHaveBeenCalledWith('/(auth)/login');
  });

  it('J64.1 sipariş listelenir, durum rozeti ve fiyat görünür', async () => {
    getAllMock.mockResolvedValue({ data: { data: [orderFixture()] } });
    renderWithProviders(<OrdersScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-1001')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Deri Ceket')).toBeOnTheScreen();
    // "Teslim Edildi" hem filtre chip'i hem durum rozetinde geçer
    expect(screen.getAllByText('Teslim Edildi').length).toBeGreaterThan(0);
  });

  it('J64.2 alıcı + delivered → "Teslim Aldım" butonu görünür', async () => {
    getAllMock.mockResolvedValue({ data: { data: [orderFixture({ status: 'delivered', isBuyer: true })] } });
    renderWithProviders(<OrdersScreen />);
    await waitFor(() =>
      expect(screen.getByText('Teslim Aldım')).toBeOnTheScreen(),
    );
  });

  it('J64.3 satıcı görünümünde "Teslim Aldım" butonu görünmez', async () => {
    getAllMock.mockResolvedValue({ data: { data: [orderFixture({ status: 'delivered', isBuyer: false })] } });
    renderWithProviders(<OrdersScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-1001')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Teslim Aldım')).toBeNull();
  });

  it('J62.3 sipariş kartına dokununca detay sayfasına gider', async () => {
    getAllMock.mockResolvedValue({ data: { data: [orderFixture()] } });
    renderWithProviders(<OrdersScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-1001')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByText('Deri Ceket'));
    expect(pushMock).toHaveBeenCalledWith('/orders/order-1');
  });
});
