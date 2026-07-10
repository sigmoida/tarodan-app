/**
 * J91/J92/J93/J94 · Teklif detayı — mobil UI dilimi.
 * Detay render, satıcıya Kabul/Karşı Teklif/Reddet butonları, alıcıya İptal butonu görünürlüğü.
 * Backend kabul/red/iptal/karşı-teklif aktarımı (escrow, sipariş oluşturma) backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({ id: 'offer-1' }),
}));

jest.mock('@/services/api', () => ({
  offersApi: {
    getOne: jest.fn(),
    accept: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    counter: jest.fn(),
  },
}));
import { offersApi } from '@/services/api';

let mockUser: { id: string } | null = { id: 'seller-1' };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

import OfferDetailScreen from '../[id]';

const getOneMock = offersApi.getOne as jest.Mock;

function offerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    productId: 'p1',
    amount: 250,
    message: 'İndirim olur mu?',
    status: 'pending',
    createdAt: new Date().toISOString(),
    buyer: { id: 'buyer-1', displayName: 'Ayşe' },
    seller: { id: 'seller-1', displayName: 'Mehmet' },
    product: { id: 'p1', title: 'Deri Ceket', price: 500 },
    ...overrides,
  };
}

describe('J91 · Teklif detayı render', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockUser = { id: 'seller-1' };
  });

  it('teklif detayını gösterir (ürün, taraflar, mesaj)', async () => {
    getOneMock.mockResolvedValue({ data: { data: offerFixture() } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Deri Ceket')).toBeOnTheScreen());
    expect(screen.getByText('İndirim olur mu?')).toBeOnTheScreen();
    expect(screen.getByText('Ayşe')).toBeOnTheScreen();
    expect(screen.getByText('Mehmet')).toBeOnTheScreen();
  });

  it('J92 · satıcı için pending teklifte Kabul/Karşı Teklif/Reddet butonları görünür', async () => {
    getOneMock.mockResolvedValue({ data: { data: offerFixture() } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Kabul Et')).toBeOnTheScreen());
    expect(screen.getByText('Karşı Teklif Ver')).toBeOnTheScreen();
    expect(screen.getByText('Reddet')).toBeOnTheScreen();
    // Alıcı iptal butonu satıcıya gösterilmez
    expect(screen.queryByText('Teklifi İptal Et')).toBeNull();
  });

  it('J93 · alıcı için pending teklifte yalnızca İptal butonu görünür', async () => {
    mockUser = { id: 'buyer-1' };
    getOneMock.mockResolvedValue({ data: { data: offerFixture() } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Teklifi İptal Et')).toBeOnTheScreen());
    expect(screen.queryByText('Kabul Et')).toBeNull();
    expect(screen.queryByText('Karşı Teklif Ver')).toBeNull();
  });

  it('J93b · karşı teklifte (buyerMustAccept) alıcıya İptal butonu gösterilmez', async () => {
    mockUser = { id: 'buyer-1' };
    getOneMock.mockResolvedValue({ data: { data: offerFixture({ buyerMustAccept: true }) } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Deri Ceket')).toBeOnTheScreen());
    expect(screen.queryByText('Teklifi İptal Et')).toBeNull();
  });

  it('J94 · pending olmayan teklifte aksiyon butonu gösterilmez', async () => {
    getOneMock.mockResolvedValue({ data: { data: offerFixture({ status: 'accepted' }) } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Deri Ceket')).toBeOnTheScreen());
    expect(screen.queryByText('Kabul Et')).toBeNull();
    expect(screen.queryByText('Reddet')).toBeNull();
    expect(screen.queryByText('Teklifi İptal Et')).toBeNull();
  });
});
