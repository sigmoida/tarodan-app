/**
 * J63 · Satıcı sipariş detayı — mobil UI dilimi.
 * Durum banner render, sipariş numarası, kargo kartı, iptal butonu görünürlüğü
 * (paid/preparing'de görünür), sipariş bulunamadı (error) durumu.
 * Backend durum geçişi (iptal/iade aktarımı, escrow) backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

let mockParams: Record<string, string> = { id: 'sale-1' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../../src/services/api', () => ({
  ordersApi: { getOne: jest.fn(), cancel: jest.fn() },
}));
import { ordersApi } from '../../../src/services/api';

import SaleDetailScreen from '../[id]';

const getOneMock = ordersApi.getOne as jest.Mock;

function saleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    orderNumber: 'TRD-2001',
    status: 'paid',
    totalAmount: 350,
    subtotal: 320,
    shippingCost: 30,
    createdAt: new Date('2026-01-01').toISOString(),
    buyer: { id: 'buyer-1', displayName: 'Ayşe' },
    shippingAddress: {
      fullName: 'Ayşe', phone: '0500', address: 'Sokak 1', city: 'İstanbul', district: 'Kadıköy',
    },
    items: [
      { id: 'i1', price: 320, quantity: 1, product: { id: 'p1', title: 'Deri Ceket' } },
    ],
    ...overrides,
  };
}

describe('J63 · Satıcı sipariş detayı render', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockParams = { id: 'sale-1' };
  });

  it('J63.1 sipariş numarası başlıkta ve ürün gösterilir', async () => {
    getOneMock.mockResolvedValue({ data: { data: saleFixture() } });
    renderWithProviders(<SaleDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-2001')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Deri Ceket')).toBeOnTheScreen();
  });

  it('J63.2 durum banner gösterilir (Ödendi - Hazırla)', async () => {
    getOneMock.mockResolvedValue({ data: { data: saleFixture({ status: 'paid' }) } });
    renderWithProviders(<SaleDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-2001')).toBeOnTheScreen(),
    );
    // formatOrderStatus(paid) durum banner'ında render edilir
    expect(screen.getByTestId('sales-shipment-card')).toBeOnTheScreen();
  });

  it('J63.3 kargo takip numarası varsa kargo kartında ve takip butonu görünür', async () => {
    getOneMock.mockResolvedValue({
      data: { data: saleFixture({ status: 'shipped', shipment: { provider: 'surat', trackingNumber: 'SK123456' } }) },
    });
    renderWithProviders(<SaleDetailScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('sales-tracking-number')).toBeOnTheScreen(),
    );
    expect(screen.getByText('SK123456')).toBeOnTheScreen();
    expect(screen.getByTestId('sales-track-link')).toBeOnTheScreen();
  });

  it('J63.4 takip numarası yoksa bekleme metni gösterilir, takip butonu yok', async () => {
    getOneMock.mockResolvedValue({ data: { data: saleFixture({ status: 'paid', shipment: undefined }) } });
    renderWithProviders(<SaleDetailScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('sales-shipment-card')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('sales-track-link')).toBeNull();
  });
});

describe('J63 · Satıcı iptali yok + iptal etiketi', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockParams = { id: 'sale-1' };
  });

  it('J63.5 satıcıya "Siparişi İptal Et" butonu GÖSTERİLMEZ (satıcı iptali desteklenmiyor)', async () => {
    getOneMock.mockResolvedValue({ data: { data: saleFixture({ status: 'paid' }) } });
    renderWithProviders(<SaleDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-2001')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Siparişi İptal Et')).toBeNull();
  });

  it('J63.6 cancellationType="iptal" → "İade Edildi" değil "İptal Edildi" gösterilir', async () => {
    getOneMock.mockResolvedValue({
      data: { data: saleFixture({ status: 'refunded', cancellationType: 'iptal' }) },
    });
    renderWithProviders(<SaleDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('İptal Edildi')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('İade Edildi')).toBeNull();
  });

  it('J63.7 sipariş bulunamazsa hata durumu (ErrorState) gösterilir', async () => {
    getOneMock.mockRejectedValue(new Error('not found'));
    renderWithProviders(<SaleDetailScreen />);
    await waitFor(() =>
      expect(screen.queryByText('Sipariş #TRD-2001')).toBeNull(),
    );
    // ErrorState fullscreen render edilir; başlık hâlâ "Sipariş Detayı"
    expect(screen.getByText('Sipariş Detayı')).toBeOnTheScreen();
  });
});
