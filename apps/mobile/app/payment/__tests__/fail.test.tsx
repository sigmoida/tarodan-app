/**
 * J73/J74/J87 · Ödeme başarısız sonuç ekranı — mobil UI dilimi.
 * Başarısız mesajı/neden render, "Tekrar Dene" buton wiring (retry + payment/[id] replace),
 * "Sipariş Detayına Git" ve "Ana Sayfaya Dön" nav. Backend confirmFailed/rezervasyon backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { paymentId: 'pay-1' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/api', () => ({
  paymentsApi: {
    confirmFailed: jest.fn(() => Promise.resolve(null)),
    getStatus: jest.fn(),
    getStatusLightGuest: jest.fn(),
    retry: jest.fn(),
  },
}));
import { paymentsApi } from '@/lib/api';
import { router } from 'expo-router';

import PaymentFailScreen from '../fail';

const getStatusMock = paymentsApi.getStatus as jest.Mock;
const retryMock = paymentsApi.retry as jest.Mock;
const replaceMock = router.replace as jest.Mock;

function infoFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    status: 'failed',
    order: { id: 'order-1', orderNumber: 'TRD-1001' },
    ...overrides,
  };
}

describe('J73 · Ödeme başarısız render', () => {
  beforeEach(() => {
    getStatusMock.mockReset();
    retryMock.mockReset();
    replaceMock.mockReset();
    (paymentsApi.confirmFailed as jest.Mock).mockResolvedValue(null);
    mockParams = { paymentId: 'pay-1' };
  });

  it('J73.1 başarısız başlık ve bilgilendirme metni gösterilir', async () => {
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    renderWithProviders(<PaymentFailScreen />);
    expect(await screen.findByText('Ödeme Başarısız')).toBeOnTheScreen();
    expect(
      screen.getByText(/Hesabınızdan bir tahsilat yapılmadı/),
    ).toBeOnTheScreen();
  });

  it('J73.2 query parametresindeki hata nedeni mesaj olarak gösterilir', async () => {
    mockParams = { paymentId: 'pay-1', error: 'Kart limiti yetersiz' };
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    renderWithProviders(<PaymentFailScreen />);
    expect(await screen.findByText('Kart limiti yetersiz')).toBeOnTheScreen();
  });
});

describe('J74 · Ödeme başarısız navigasyon wiring', () => {
  beforeEach(() => {
    getStatusMock.mockReset();
    retryMock.mockReset();
    replaceMock.mockReset();
    (paymentsApi.confirmFailed as jest.Mock).mockResolvedValue(null);
    mockParams = { paymentId: 'pay-1' };
  });

  it('J74.1 "Tekrar Dene" → retry çağrılır ve payment/[id] ekranına replace edilir', async () => {
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    retryMock.mockResolvedValue({});
    renderWithProviders(<PaymentFailScreen />);
    const btn = await screen.findByText('Tekrar Dene');
    fireEvent.press(btn);
    await waitFor(() => expect(retryMock).toHaveBeenCalledWith('pay-1'));
    expect(replaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/payment/[id]' }),
    );
  });

  it('J74.2 "Sipariş Detayına Git" → sipariş detayına replace eder', async () => {
    getStatusMock.mockResolvedValue({ data: { data: infoFixture() } });
    renderWithProviders(<PaymentFailScreen />);
    const btn = await screen.findByText('Sipariş Detayına Git');
    fireEvent.press(btn);
    expect(replaceMock).toHaveBeenCalledWith('/orders/order-1');
  });

  it('J74.3 misafir ödemede "Sipariş Detayına Git" butonu gösterilmez', async () => {
    mockParams = { paymentId: 'pay-1', guest: '1' };
    (paymentsApi.getStatusLightGuest as jest.Mock).mockResolvedValue({
      data: { data: infoFixture() },
    });
    renderWithProviders(<PaymentFailScreen />);
    expect(await screen.findByText('Ana Sayfaya Dön')).toBeOnTheScreen();
    expect(screen.queryByText('Sipariş Detayına Git')).toBeNull();
  });
});
