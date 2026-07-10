/**
 * J30/J106 · Koleksiyon detayı — mobil UI dilimi.
 * Render (ad/açıklama/istatistik), paylaş + beğeni butonu varlığı, beğeni optimistic artışı,
 * giriş yapılmamışsa beğeni → login'e yönlendirme, sahiplik: yabancıda düzenle butonu gizli,
 * koleksiyon bulunamadı durumu.
 * Backend: like kalıcılığı, viewCount artışı, share sayacı backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { id: 'col-1' };
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: mockPush, replace: jest.fn(), back: mockBack, canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn() },
  collectionsApi: { like: jest.fn(), unlike: jest.fn() },
}));
import { api, collectionsApi } from '@/services/api';

let mockAuth: Record<string, unknown> = {
  isAuthenticated: true,
  user: { id: 'owner-1', membershipTier: 'free' },
};
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

import CollectionDetailScreen from '../index';

const getMock = api.get as jest.Mock;

function collectionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'col-1',
    name: 'Ferrari Koleksiyonum',
    description: 'En sevdiğim modeller',
    userId: 'owner-1',
    userName: 'Mehmet',
    itemCount: 3,
    viewCount: 42,
    likeCount: 5,
    shareCount: 2,
    isLiked: false,
    items: [],
    ...overrides,
  };
}

describe('J30 · Koleksiyon detayı render + paylaş/beğeni', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockPush.mockClear();
    mockParams = { id: 'col-1' };
    mockAuth = { isAuthenticated: true, user: { id: 'owner-1', membershipTier: 'free' } };
  });

  it('J30.1 koleksiyon adı ve açıklaması gösterilir', async () => {
    getMock.mockResolvedValue({ data: { data: collectionFixture() } });
    renderWithProviders(<CollectionDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Ferrari Koleksiyonum')).toBeOnTheScreen(),
    );
    expect(screen.getByText('En sevdiğim modeller')).toBeOnTheScreen();
    expect(screen.getByText('Görüntülenme')).toBeOnTheScreen();
  });

  it('J30.2 beğeni/paylaşım istatistik rozetleri gösterilir', async () => {
    getMock.mockResolvedValue({ data: { data: collectionFixture({ likeCount: 5, shareCount: 2 }) } });
    renderWithProviders(<CollectionDetailScreen />);
    await waitFor(() => expect(screen.getByText('Beğeni')).toBeOnTheScreen());
    expect(screen.getByText('5')).toBeOnTheScreen();
    expect(screen.getByText('Paylaşım')).toBeOnTheScreen();
    // NOT: kalp (beğeni) ve paylaş ikon butonlarında testID/accessibilityLabel yok,
    // bu yüzden basma davranışı (optimistic artış, login yönlendirme) güvenilir
    // sorgulanamıyor → missingScreens'e missing-testID olarak raporlandı.
  });

  it('J30.4 koleksiyon bulunamazsa boş durum gösterilir', async () => {
    getMock.mockResolvedValue({ data: null });
    renderWithProviders(<CollectionDetailScreen />);
    expect(await screen.findByText('Koleksiyon bulunamadı')).toBeOnTheScreen();
  });
});

describe('J106 · Sahiplik kontrolü (düzenle butonu)', () => {
  beforeEach(() => {
    getMock.mockReset();
    mockPush.mockClear();
    mockParams = { id: 'col-1' };
  });

  it('J106.1 sahip ise "Ürün Ekle" kontrolü görünür', async () => {
    mockAuth = { isAuthenticated: true, user: { id: 'owner-1', membershipTier: 'free' } };
    getMock.mockResolvedValue({ data: { data: collectionFixture({ userId: 'owner-1' }) } });
    renderWithProviders(<CollectionDetailScreen />);
    await waitFor(() => expect(screen.getByText('Ürün Ekle')).toBeOnTheScreen());
  });

  it('J106.2 yabancı kullanıcıda sahip kontrolleri gizli (model sayısı gösterilir)', async () => {
    mockAuth = { isAuthenticated: true, user: { id: 'stranger-9', membershipTier: 'free' } };
    getMock.mockResolvedValue({ data: { data: collectionFixture({ userId: 'owner-1' }) } });
    renderWithProviders(<CollectionDetailScreen />);
    await waitFor(() => expect(screen.getByText('Ferrari Koleksiyonum')).toBeOnTheScreen());
    expect(screen.queryByText('Ürün Ekle')).toBeNull();
    expect(screen.getByText('0 model')).toBeOnTheScreen();
  });
});
