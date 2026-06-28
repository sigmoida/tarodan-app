/**
 * J63 · Satışlarım listesi — mobil UI dilimi.
 * Durum rozeti (StatusBadge) render, "Hazırlanıyor Olarak İşaretle" buton
 * görünürlüğü (yalnız paid durumda; ödenmemiş/pending'de gizli), giriş yapmamış
 * durumu, boş liste durumu, filtre chip render.
 * Backend durum geçişi (markAsPreparing, shipment) backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../src/services/api', () => ({
  ordersApi: { getAll: jest.fn(), getSellerEarnings: jest.fn(), markAsPreparing: jest.fn() },
  shippingApi: { createShipment: jest.fn(), updateTracking: jest.fn() },
}));
import { ordersApi } from '../../../src/services/api';

let mockAuth = { isAuthenticated: true };
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

import SalesScreen from '../index';

const getAllMock = ordersApi.getAll as jest.Mock;
const earningsMock = ordersApi.getSellerEarnings as jest.Mock;

function saleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    orderNumber: 'TRD-3001',
    status: 'paid',
    totalAmount: 350,
    product: { id: 'p1', title: 'Deri Ceket', images: [] },
    buyer: { id: 'b1', displayName: 'Ayşe' },
    shippingAddress: { fullName: 'Ayşe', address: 'Sokak 1', city: 'İstanbul' },
    createdAt: new Date('2026-01-01').toISOString(),
    ...overrides,
  };
}

describe('J63 · Satışlarım listesi', () => {
  beforeEach(() => {
    getAllMock.mockReset();
    earningsMock.mockReset();
    earningsMock.mockResolvedValue({ data: { totalEarnings: 0, pendingEarnings: 0 } });
    mockAuth = { isAuthenticated: true };
  });

  it('J63.8 giriş yapılmamışsa giriş çağrısı gösterilir', () => {
    mockAuth = { isAuthenticated: false };
    renderWithProviders(<SalesScreen />);
    expect(screen.getByText('Satışlarınızı görmek için giriş yapın')).toBeOnTheScreen();
  });

  it('J63.9 satış yoksa boş durum gösterilir', async () => {
    getAllMock.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<SalesScreen />);
    await waitFor(() =>
      expect(screen.getByText('Henüz satışınız yok')).toBeOnTheScreen(),
    );
  });

  it('J63.10 satış kartı sipariş no + durum rozeti ile render edilir', async () => {
    getAllMock.mockResolvedValue({ data: { data: [saleFixture({ status: 'paid' })] } });
    renderWithProviders(<SalesScreen />);
    await waitFor(() =>
      expect(screen.getByText('#TRD-3001')).toBeOnTheScreen(),
    );
    // StatusBadge paid → 'Ödendi - Hazırla' (filtre chip'inde de aynı etiket geçer)
    expect(screen.getAllByText('Ödendi - Hazırla').length).toBeGreaterThan(0);
  });

  it('J63.11 paid durumda "Hazırlanıyor Olarak İşaretle" butonu görünür', async () => {
    getAllMock.mockResolvedValue({ data: { data: [saleFixture({ status: 'paid' })] } });
    renderWithProviders(<SalesScreen />);
    await waitFor(() =>
      expect(screen.getByText('Hazırlanıyor Olarak İşaretle')).toBeOnTheScreen(),
    );
  });

  it('J63.12 ödenmemiş (pending_payment) durumda hazırlanıyor butonu gizli', async () => {
    getAllMock.mockResolvedValue({ data: { data: [saleFixture({ status: 'pending_payment' })] } });
    renderWithProviders(<SalesScreen />);
    await waitFor(() =>
      expect(screen.getByText('#TRD-3001')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Hazırlanıyor Olarak İşaretle')).toBeNull();
    // pending_payment → 'Ödeme Bekliyor' rozeti
    expect(screen.getByText('Ödeme Bekliyor')).toBeOnTheScreen();
  });

  it('J63.13 processing durumda "Kargoya Ver" butonu görünür (hazırlanıyor butonu yok)', async () => {
    getAllMock.mockResolvedValue({ data: { data: [saleFixture({ status: 'processing' })] } });
    renderWithProviders(<SalesScreen />);
    await waitFor(() =>
      expect(screen.getByText('Kargoya Ver')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Hazırlanıyor Olarak İşaretle')).toBeNull();
  });

  it('J63.14 filtre chipleri render edilir', async () => {
    getAllMock.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<SalesScreen />);
    await waitFor(() =>
      expect(screen.getByText('Tümü')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Kargoda')).toBeOnTheScreen();
  });
});
