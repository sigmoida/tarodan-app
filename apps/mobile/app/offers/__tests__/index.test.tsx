/**
 * J3/J4 · Teklif listesi (Tekliflerim) — mobil UI dilimi.
 * Liste render, boş durum, sekme metinleri, gelen teklif aksiyon butonları görünürlüğü.
 * Backend kabul/red/karşı-teklif aktarımı backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Yeni mimaride ekran/hook'lar `@/lib/api`'den import ediyor (services/api artık
// yalnız geriye-dönük barrel). Mock, kodun gerçekten import ettiği modülü hedefler.
jest.mock('@/lib/api', () => ({
  offersApi: { getAll: jest.fn() },
  ordersApi: { getCommissionPreviewBatch: jest.fn(() => Promise.resolve({ data: { results: [] } })) },
}));
import { offersApi } from '@/lib/api';

let mockAuth = { isAuthenticated: true, isLoading: false };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

import OffersScreen from '../index';

const getAllMock = offersApi.getAll as jest.Mock;

describe('J3 · Tekliflerim listesi', () => {
  beforeEach(() => {
    getAllMock.mockReset();
    mockAuth = { isAuthenticated: true, isLoading: false };
  });

  it('boş durumda "Henüz gelen teklif yok" gösterir', async () => {
    getAllMock.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<OffersScreen />);
    await waitFor(() =>
      expect(screen.getByText('Henüz gelen teklif yok')).toBeOnTheScreen(),
    );
    // Sekmeler render olur
    expect(screen.getByText('Gelen')).toBeOnTheScreen();
    expect(screen.getByText('Gönderilen')).toBeOnTheScreen();
  });

  it('gelen pending teklifi kart olarak render eder, aksiyon butonları görünür', async () => {
    getAllMock.mockResolvedValue({
      data: {
        data: [
          {
            id: 'o1',
            amount: 200,
            status: 'pending',
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            createdAt: new Date().toISOString(),
            product: { id: 'p1', title: 'Vintage Kamera', price: 400 },
            buyer: { id: 'b1', displayName: 'Ali Veli' },
          },
        ],
      },
    });
    renderWithProviders(<OffersScreen />);

    await waitFor(() => expect(screen.getByText('Vintage Kamera')).toBeOnTheScreen());
    expect(screen.getByText('Kabul Et')).toBeOnTheScreen();
    expect(screen.getByText('Reddet')).toBeOnTheScreen();
    expect(screen.getByText('Karşı Teklif')).toBeOnTheScreen();
    expect(screen.getByText('Ali Veli')).toBeOnTheScreen();
  });

  it('giriş yapılmamışsa auth gate gösterir', async () => {
    mockAuth = { isAuthenticated: false, isLoading: false };
    renderWithProviders(<OffersScreen />);
    expect(screen.getByText('Tekliflerinizi görmek için giriş yapın')).toBeOnTheScreen();
    expect(screen.getByText('Giriş Yap')).toBeOnTheScreen();
  });
});
