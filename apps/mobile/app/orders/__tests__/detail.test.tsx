/**
 * J67/J78/J79 · Sipariş detayı — mobil UI dilimi.
 * Durum rozeti render, "Teslimatı Onayla" buton görünürlüğü (alıcı + delivered),
 * iade talep butonu görünürlüğü (ödeme tamamlandı + alıcı), sipariş bulunamadı durumu.
 * Backend onay/iade aktarımı (escrow, transfer, webhook) backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

let mockParams: Record<string, string> = { id: 'order-1' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../../src/services/api', () => ({
  api: { get: jest.fn() },
  ordersApi: { confirm: jest.fn(), confirmReceipt: jest.fn() },
  refundsApi: { create: jest.fn(), cancel: jest.fn() },
}));
import { api } from '../../../src/services/api';

import OrderDetailScreen from '../[id]';

const getMock = api.get as jest.Mock;

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'TRD-1001',
    status: 'delivered',
    totalAmount: 350,
    shippingCost: 30,
    product: { id: 'p1', title: 'Deri Ceket', price: 320, condition: 'used', images: [] },
    seller: { id: 'seller-1', displayName: 'Mehmet' },
    shippingAddress: {
      fullName: 'Ayşe', phone: '0500', address: 'Sokak 1', city: 'İstanbul',
    },
    createdAt: new Date('2026-01-01').toISOString(),
    isBuyer: true,
    payment: { status: 'completed' },
    ...overrides,
  };
}

describe('J67 · Sipariş detayı render', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockParams = { id: 'order-1' };
  });

  it('J67.1 sipariş numarası ve durum rozeti gösterilir', async () => {
    getMock.mockResolvedValue({ data: { data: orderFixture() } });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-1001')).toBeOnTheScreen(),
    );
    // "Teslim Edildi" hem rozet hem timeline etiketinde geçer
    expect(screen.getAllByText('Teslim Edildi').length).toBeGreaterThan(0);
  });

  it('J67.2 sipariş bulunamazsa hata durumu gösterilir', async () => {
    getMock.mockRejectedValue(new Error('not found'));
    renderWithProviders(<OrderDetailScreen />);
    expect(await screen.findByText('Sipariş bulunamadı')).toBeOnTheScreen();
  });
});

describe('J78 · Teslimatı onayla buton görünürlüğü', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockParams = { id: 'order-1' };
  });

  it('J78.1 alıcı + delivered → "Teslimatı Onayla" butonu görünür', async () => {
    getMock.mockResolvedValue({ data: { data: orderFixture({ status: 'delivered', isBuyer: true }) } });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('order-confirm-delivery-button')).toBeOnTheScreen(),
    );
  });

  it('J78.2 alıcı değilse "Teslimatı Onayla" butonu görünmez', async () => {
    getMock.mockResolvedValue({ data: { data: orderFixture({ status: 'delivered', isBuyer: false }) } });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-1001')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('order-confirm-delivery-button')).toBeNull();
  });

  it('J78.3 durum delivered değilse buton görünmez (shipped)', async () => {
    getMock.mockResolvedValue({ data: { data: orderFixture({ status: 'shipped', isBuyer: true }) } });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Kargoda')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('order-confirm-delivery-button')).toBeNull();
  });
});

describe('J79 · İade talep butonu görünürlüğü', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockParams = { id: 'order-1' };
  });

  it('J79.1 alıcı + ödeme tamamlandı + aktif iade yok → "İade Talep Et" görünür', async () => {
    getMock.mockResolvedValue({
      data: { data: orderFixture({ isBuyer: true, payment: { status: 'completed' }, activeRefundRequest: null }) },
    });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('refund-request-button')).toBeOnTheScreen(),
    );
  });

  it('J79.2 iade modalı açılır ve nedenler listelenir', async () => {
    getMock.mockResolvedValue({
      data: { data: orderFixture({ isBuyer: true, payment: { status: 'completed' } }) },
    });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('refund-request-button')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('refund-request-button'));
    await waitFor(() =>
      expect(screen.getByText('İade Talebi Oluştur')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Hasarlı geldi')).toBeOnTheScreen();
  });

  it('J79.3 ödeme tamamlanmadıysa "İade Talep Et" görünmez', async () => {
    getMock.mockResolvedValue({
      data: { data: orderFixture({ isBuyer: true, payment: { status: 'pending' } }) },
    });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Sipariş #TRD-1001')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('refund-request-button')).toBeNull();
  });
});

describe('Üyelik/dijital sipariş — fiziksel ürün aksiyonları gizlenir', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockParams = { id: 'order-1' };
  });

  // Üyelik siparişi: sanal ürün + platform satıcısı, "MEM-" sipariş no, isMembership=true
  const membershipFixture = (overrides: Record<string, unknown> = {}) =>
    orderFixture({
      orderNumber: 'MEM-1781257318265-BENIPST9F',
      isMembership: true,
      status: 'completed',
      isBuyer: true,
      payment: { status: 'completed' },
      activeRefundRequest: null,
      hasProductRating: false,
      hasSellerRating: false,
      shippingAddress: null,
      ...overrides,
    });

  it('değerlendirme bölümü gösterilmez', async () => {
    getMock.mockResolvedValue({ data: { data: membershipFixture() } });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('Sipariş #MEM-1781257318265-BENIPST9F'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Değerlendirme')).toBeNull();
    expect(screen.queryByText('Ürünü Değerlendir')).toBeNull();
  });

  it('iade talep butonu gösterilmez', async () => {
    getMock.mockResolvedValue({ data: { data: membershipFixture() } });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('Sipariş #MEM-1781257318265-BENIPST9F'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('refund-request-button')).toBeNull();
  });

  it('teslimat adresi bölümü gösterilmez', async () => {
    getMock.mockResolvedValue({ data: { data: membershipFixture() } });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('Sipariş #MEM-1781257318265-BENIPST9F'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Teslimat Adresi')).toBeNull();
  });

  it('isMembership alanı yoksa "MEM-" önekiyle de gizlenir (geriye dönük)', async () => {
    getMock.mockResolvedValue({
      data: { data: membershipFixture({ isMembership: undefined }) },
    });
    renderWithProviders(<OrderDetailScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('Sipariş #MEM-1781257318265-BENIPST9F'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Değerlendirme')).toBeNull();
    expect(screen.queryByTestId('refund-request-button')).toBeNull();
  });
});
