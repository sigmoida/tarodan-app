/**
 * J10/J82/J84/J85/J86 · Satıcı iade talepleri — mobil UI dilimi.
 * Liste render, durum rozeti (pending_review/wait_for_delivery), Kabul/Reddet buton
 * görünürlüğü (yalnız pending_review → karar verilebilir), red gerekçe modalı + kısa
 * gerekçe validasyon UI, boş durum, misafir (giriş yok) durumu.
 * Backend mantığı (kabul/red aktarımı, escrow, kargo, para iadesi) backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderWithProviders } from '../../../src/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../src/services/api', () => ({
  refundsApi: { getSeller: jest.fn(), accept: jest.fn(), reject: jest.fn() },
}));
import { refundsApi } from '../../../src/services/api';

let mockIsAuthenticated = true;
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

import SellerRefundRequestsScreen from '../seller';

const getSellerMock = refundsApi.getSeller as jest.Mock;
const rejectMock = refundsApi.reject as jest.Mock;

function refundFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refund-1',
    status: 'pending_review',
    reason: 'damaged',
    amount: 350,
    description: 'Ürün kırık geldi',
    order: { orderNumber: 'TRD-2001', product: { title: 'Deri Ceket' } },
    requester: { displayName: 'Ayşe' },
    ...overrides,
  };
}

describe('J82 · Satıcı iade talepleri liste render', () => {
  beforeEach(() => {
    getSellerMock.mockReset();
    rejectMock.mockReset();
    mockIsAuthenticated = true;
  });

  it('J82.1 talep kartı: ürün, alıcı, sebep, durum rozeti gösterilir', async () => {
    getSellerMock.mockResolvedValue({ data: { data: [refundFixture()] } });
    renderWithProviders(<SellerRefundRequestsScreen />);

    await waitFor(() => expect(screen.getByText('Deri Ceket')).toBeOnTheScreen());
    expect(screen.getByText('#TRD-2001')).toBeOnTheScreen();
    expect(screen.getByText('Sebep: Hasarlı geldi')).toBeOnTheScreen();
    expect(screen.getByText('Alıcı: Ayşe')).toBeOnTheScreen();
    expect(screen.getByText('İnceleme Bekliyor')).toBeOnTheScreen();
  });

  it('J82.2 boş liste → "İade talebi yok" boş durumu', async () => {
    getSellerMock.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<SellerRefundRequestsScreen />);
    expect(await screen.findByText('İade talebi yok')).toBeOnTheScreen();
  });
});

describe('J84 · Durum rozeti varyasyonları', () => {
  beforeEach(() => {
    getSellerMock.mockReset();
    mockIsAuthenticated = true;
  });

  it('J84.1 wait_for_delivery → "İade Kargosu Bekleniyor" rozeti', async () => {
    getSellerMock.mockResolvedValue({
      data: { data: [refundFixture({ status: 'wait_for_delivery' })] },
    });
    renderWithProviders(<SellerRefundRequestsScreen />);
    await waitFor(() =>
      expect(screen.getByText('İade Kargosu Bekleniyor')).toBeOnTheScreen(),
    );
  });

  it('J84.2 rejected → "Reddedildi" rozeti', async () => {
    getSellerMock.mockResolvedValue({
      data: { data: [refundFixture({ status: 'rejected' })] },
    });
    renderWithProviders(<SellerRefundRequestsScreen />);
    await waitFor(() => expect(screen.getByText('Reddedildi')).toBeOnTheScreen());
  });
});

describe('J85 · Kabul/Reddet buton görünürlüğü', () => {
  beforeEach(() => {
    getSellerMock.mockReset();
    mockIsAuthenticated = true;
  });

  it('J85.1 pending_review → "Kabul Et" ve "Reddet" butonları görünür', async () => {
    getSellerMock.mockResolvedValue({ data: { data: [refundFixture()] } });
    renderWithProviders(<SellerRefundRequestsScreen />);
    await waitFor(() => expect(screen.getByText('Kabul Et')).toBeOnTheScreen());
    expect(screen.getByText('Reddet')).toBeOnTheScreen();
  });

  it('J85.2 pending_review olmayan durumda karar butonları gizli', async () => {
    getSellerMock.mockResolvedValue({
      data: { data: [refundFixture({ status: 'accepted' })] },
    });
    renderWithProviders(<SellerRefundRequestsScreen />);
    await waitFor(() => expect(screen.getByText('Kabul Edildi')).toBeOnTheScreen());
    expect(screen.queryByText('Kabul Et')).toBeNull();
    expect(screen.queryByText('Reddet')).toBeNull();
  });
});

describe('J86 · Red gerekçe modalı + validasyon UI', () => {
  beforeEach(() => {
    getSellerMock.mockReset();
    rejectMock.mockReset();
    mockIsAuthenticated = true;
  });

  it('J86.1 "Reddet" basınca gerekçe modalı açılır', async () => {
    getSellerMock.mockResolvedValue({ data: { data: [refundFixture()] } });
    renderWithProviders(<SellerRefundRequestsScreen />);
    await waitFor(() => expect(screen.getByText('Reddet')).toBeOnTheScreen());

    fireEvent.press(screen.getByText('Reddet'));
    await waitFor(() =>
      expect(screen.getByText('İade Talebini Reddet')).toBeOnTheScreen(),
    );
    expect(
      screen.getByText('Reddetme gerekçenizi yazın (alıcıya iletilir).'),
    ).toBeOnTheScreen();
  });

  it('J86.2 kısa gerekçe (<10) → validasyon uyarısı, reject çağrılmaz', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    getSellerMock.mockResolvedValue({ data: { data: [refundFixture()] } });
    renderWithProviders(<SellerRefundRequestsScreen />);
    await waitFor(() => expect(screen.getByText('Reddet')).toBeOnTheScreen());

    fireEvent.press(screen.getByText('Reddet'));
    await waitFor(() =>
      expect(screen.getByText('İade Talebini Reddet')).toBeOnTheScreen(),
    );

    fireEvent.changeText(screen.getByPlaceholderText('Örn: Ürün kullanılmış olarak iade edildi'), 'kısa');
    // modal içindeki ikinci "Reddet" butonu submit'tir
    const rejectButtons = screen.getAllByText('Reddet');
    fireEvent.press(rejectButtons[rejectButtons.length - 1]);

    expect(alertSpy).toHaveBeenCalledWith(
      'Gerekçe gerekli',
      'Red gerekçesi en az 10 karakter olmalıdır.',
    );
    expect(rejectMock).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('J10 · Misafir (giriş yok) durumu', () => {
  beforeEach(() => {
    getSellerMock.mockReset();
  });

  it('J10.1 giriş yapılmadıysa giriş yönlendirme ekranı gösterilir', async () => {
    mockIsAuthenticated = false;
    renderWithProviders(<SellerRefundRequestsScreen />);
    expect(screen.getByText('İade taleplerini görmek için giriş yapın')).toBeOnTheScreen();
    expect(screen.getByText('Giriş Yap')).toBeOnTheScreen();
  });
});
