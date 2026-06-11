/**
 * J71/J72/J90 · Ödeme başarılı sonuç ekranı — mobil UI dilimi.
 * Başarı mesajı render, sipariş özeti (sipariş no/tutar/durum), "Siparişimi Gör" ve
 * "Ana Sayfaya Dön" nav butonları. Backend verify/callback/idempotency backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

let mockParams: Record<string, string> = { paymentId: 'pay-1' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../../src/services/api', () => ({
  paymentsApi: {
    verify: jest.fn(() => Promise.resolve({})),
    getStatus: jest.fn(),
    getStatusLightGuest: jest.fn(),
  },
}));
import { paymentsApi } from '../../../src/services/api';
import { router } from 'expo-router';

import PaymentSuccessScreen from '../success';

const getStatusMock = paymentsApi.getStatus as jest.Mock;
const replaceMock = router.replace as jest.Mock;

function infoFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    amount: 350,
    status: 'paid',
    order: { id: 'order-1', orderNumber: 'TRD-1001' },
    ...overrides,
  };
}

describe('J71 · Ödeme başarılı render', () => {
  beforeEach(() => {
    getStatusMock.mockReset();
    replaceMock.mockReset();
    (paymentsApi.verify as jest.Mock).mockResolvedValue({});
    mockParams = { paymentId: 'pay-1' };
  });

  it('J71.1 başarı başlığı ve alt mesaj gösterilir', async () => {
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    renderWithProviders(<PaymentSuccessScreen />);
    expect(await screen.findByText('Ödemeniz Başarılı!')).toBeOnTheScreen();
    expect(
      screen.getByText('Siparişiniz alındı. Detayları e-posta adresinize gönderdik.'),
    ).toBeOnTheScreen();
  });

  it('J71.2 sipariş özeti: sipariş no, tutar ve durum rozeti', async () => {
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    renderWithProviders(<PaymentSuccessScreen />);
    expect(await screen.findByText('TRD-1001')).toBeOnTheScreen();
    expect(screen.getByText('Sipariş No')).toBeOnTheScreen();
    expect(screen.getByText('Tutar')).toBeOnTheScreen();
    // status 'paid' → 'Ödendi' etiketi
    expect(screen.getByText('Ödendi')).toBeOnTheScreen();
  });
});

describe('J72 · Ödeme başarılı navigasyon wiring', () => {
  beforeEach(() => {
    getStatusMock.mockReset();
    replaceMock.mockReset();
    (paymentsApi.verify as jest.Mock).mockResolvedValue({});
    mockParams = { paymentId: 'pay-1' };
  });

  it('J72.1 "Siparişimi Gör" → ilgili sipariş detayına replace eder', async () => {
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    renderWithProviders(<PaymentSuccessScreen />);
    const btn = await screen.findByText('Siparişimi Gör');
    fireEvent.press(btn);
    expect(replaceMock).toHaveBeenCalledWith('/orders/order-1');
  });

  it('J72.2 "Ana Sayfaya Dön" → köke replace eder', async () => {
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    renderWithProviders(<PaymentSuccessScreen />);
    const btn = await screen.findByText('Ana Sayfaya Dön');
    fireEvent.press(btn);
    expect(replaceMock).toHaveBeenCalledWith('/');
  });

  it('J72.3 misafir ödemede "Siparişimi Gör" butonu gösterilmez', async () => {
    mockParams = { paymentId: 'pay-1', guest: '1' };
    (paymentsApi.getStatusLightGuest as jest.Mock).mockResolvedValue({
      data: { data: infoFixture() },
    });
    renderWithProviders(<PaymentSuccessScreen />);
    expect(await screen.findByText('Ana Sayfaya Dön')).toBeOnTheScreen();
    expect(screen.queryByText('Siparişimi Gör')).toBeNull();
  });
});
