/**
 * J78/J79/J89 · Ödeme geçmişi — mobil UI dilimi.
 * Liste render, boş durum, durum rozetleri (başarılı/başarısız/bekliyor), giriş gerekli durumu.
 * Backend ödeme listesi kaynağı/escrow/webhook backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), []);
  },
}));

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
  paymentsApi: { getMyPayments: jest.fn() },
}));
import { api } from '@/lib/api';

let mockIsAuthenticated = true;
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

import PaymentHistoryScreen from '../payment-history';

const getMock = api.get as jest.Mock;

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    amount: 199.9,
    status: 'completed',
    method: 'Kredi Kartı',
    description: 'Premium Üyelik',
    createdAt: new Date('2026-01-15').toISOString(),
    ...overrides,
  };
}

describe('J78 · Ödeme geçmişi liste render', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockIsAuthenticated = true;
  });

  it('J78.1 ödemeler listelenir (açıklama + tutar)', async () => {
    getMock.mockResolvedValue({ data: { data: [payment()] } });
    renderWithProviders(<PaymentHistoryScreen />);
    await waitFor(() =>
      expect(screen.getByText('Premium Üyelik')).toBeOnTheScreen(),
    );
    expect(screen.getByText('₺199,90')).toBeOnTheScreen();
    expect(screen.getByText('Kredi Kartı')).toBeOnTheScreen();
  });

  it('J78.2 birden çok ödeme render edilir', async () => {
    getMock.mockResolvedValue({
      data: { data: [
        payment({ id: 'p1', description: 'Ödeme A' }),
        payment({ id: 'p2', description: 'Ödeme B' }),
      ] },
    });
    renderWithProviders(<PaymentHistoryScreen />);
    await waitFor(() => expect(screen.getByText('Ödeme A')).toBeOnTheScreen());
    expect(screen.getByText('Ödeme B')).toBeOnTheScreen();
  });
});

describe('J79 · Durum rozetleri', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockIsAuthenticated = true;
  });

  it('J79.1 başarılı ödeme → "Tamamlandı" rozeti', async () => {
    getMock.mockResolvedValue({ data: { data: [payment({ status: 'completed' })] } });
    renderWithProviders(<PaymentHistoryScreen />);
    await waitFor(() => expect(screen.getByText('Tamamlandı')).toBeOnTheScreen());
  });

  it('J79.2 başarısız ödeme → "Başarısız" rozeti', async () => {
    getMock.mockResolvedValue({ data: { data: [payment({ status: 'failed' })] } });
    renderWithProviders(<PaymentHistoryScreen />);
    await waitFor(() => expect(screen.getByText('Başarısız')).toBeOnTheScreen());
  });

  it('J79.3 bekleyen ödeme → "Bekliyor" rozeti', async () => {
    getMock.mockResolvedValue({ data: { data: [payment({ status: 'pending' })] } });
    renderWithProviders(<PaymentHistoryScreen />);
    await waitFor(() => expect(screen.getByText('Bekliyor')).toBeOnTheScreen());
  });
});

describe('J89 · Boş / giriş gerekli durumu', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockIsAuthenticated = true;
  });

  it('J89.1 ödeme yoksa boş durum mesajı gösterilir', async () => {
    getMock.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<PaymentHistoryScreen />);
    await waitFor(() =>
      expect(screen.getByText('Ödeme geçmişiniz bulunmuyor')).toBeOnTheScreen(),
    );
  });

  it('J89.2 misafir kullanıcı → giriş yap çağrısı gösterilir', async () => {
    mockIsAuthenticated = false;
    renderWithProviders(<PaymentHistoryScreen />);
    expect(screen.getByText('Giriş Yapın')).toBeOnTheScreen();
    expect(screen.getByText('Giriş Yap')).toBeOnTheScreen();
  });
});
