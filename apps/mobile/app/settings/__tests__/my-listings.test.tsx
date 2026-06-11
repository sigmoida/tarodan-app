/**
 * J68/J133 · İlanlarım ekranı (settings/my-listings) — mobil UI dilimi.
 * Durum filtre chip'leri (sayaçlı render + seçim), "Reddedildi" durum rozeti,
 * eylem menüsü → "Düzenle" navigasyon wiring (router.push /listing/:id/edit).
 * Backend (ilan durum geçişleri, relist limiti, deaktif/sil kalıcılığı) backendOnly.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: any[]) => mockPush(...a), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: (cb: any) => cb(),
}));

jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { listingCount: 2, membershipTier: 'free' },
    limits: { maxListings: 10 },
    refreshUserData: jest.fn(),
  }),
}));

// BoostModal native bağımlılıklarını izole et — UI dilimi dışı.
jest.mock('../../../src/components/product/BoostModal', () => ({
  BoostModal: () => null,
}));

const mockGetMyListings = jest.fn();
const mockGetMyStats = jest.fn();
jest.mock('../../../src/services/api', () => ({
  productsApi: {
    getMyListings: (...a: any[]) => mockGetMyListings(...a),
    getMyStats: (...a: any[]) => mockGetMyStats(...a),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

import MyListingsScreen from '../my-listings';

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'L1',
    title: 'Hot Wheels Camaro',
    price: 250,
    status: 'active',
    viewCount: 12,
    likeCount: 3,
    images: [],
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
    condition: 'good',
    ...overrides,
  };
}

function wireStats() {
  mockGetMyStats.mockResolvedValue({
    data: {
      counts: { all: 3, active: 1, pending: 0, sold: 1, reserved: 0, rejected: 1, inactive: 0 },
    },
  });
}

describe('J68 · İlanlarım filtre chip + durum rozeti', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGetMyListings.mockReset();
    mockGetMyStats.mockReset();
    wireStats();
  });

  it('J68.1 filtre chip\'leri sunucu sayaçlarıyla render olur (Tümü/Reddedildi)', async () => {
    mockGetMyListings.mockResolvedValue({ data: { data: [listing()] } });
    renderWithProviders(<MyListingsScreen />);
    expect(await screen.findByText('Tümü (3)')).toBeOnTheScreen();
    expect(screen.getByText('Reddedildi (1)')).toBeOnTheScreen();
    expect(screen.getByText('Aktif (1)')).toBeOnTheScreen();
  });

  it('J68.2 reddedilen ilan → "Reddedildi" durum rozeti gösterilir', async () => {
    mockGetMyListings.mockResolvedValue({ data: { data: [listing({ status: 'rejected', title: 'Reddedilen İlan' })] } });
    renderWithProviders(<MyListingsScreen />);
    expect(await screen.findByText('Reddedilen İlan')).toBeOnTheScreen();
    // "Reddedildi" hem chip etiketinde hem ilan rozetinde geçer → en az 2
    await waitFor(() =>
      expect(screen.getAllByText(/Reddedildi/).length).toBeGreaterThanOrEqual(2),
    );
  });

  it('J68.3 boş liste → boş durum mesajı', async () => {
    mockGetMyListings.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<MyListingsScreen />);
    expect(await screen.findByText('Henüz ilan yok')).toBeOnTheScreen();
  });
});

describe('J133 · İlan düzenleme navigasyon wiring', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGetMyListings.mockReset();
    mockGetMyStats.mockReset();
    wireStats();
  });

  it('J133.1 eylem menüsü → "Düzenle" → /listing/:id/edit push', async () => {
    mockGetMyListings.mockResolvedValue({ data: { data: [listing({ id: 'L9', status: 'active' })] } });
    renderWithProviders(<MyListingsScreen />);
    await screen.findByText('Hot Wheels Camaro');

    // İlan menüsünü aç (accessibilityLabel="İlan menüsü")
    fireEvent.press(screen.getByLabelText('İlan menüsü'));
    await screen.findByText('Düzenle');
    fireEvent.press(screen.getByText('Düzenle'));

    expect(mockPush).toHaveBeenCalledWith('/listing/L9/edit');
  });

  it('J133.2 ilan kartına basınca ürün detayına gider', async () => {
    mockGetMyListings.mockResolvedValue({ data: { data: [listing({ id: 'L9' })] } });
    renderWithProviders(<MyListingsScreen />);
    fireEvent.press(await screen.findByText('Hot Wheels Camaro'));
    expect(mockPush).toHaveBeenCalledWith('/product/L9');
  });
});
