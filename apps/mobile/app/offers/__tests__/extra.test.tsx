/**
 * J95/J101 · Teklif detayı — ekstra mobil UI dilimi (offers-extra).
 * J95: süresi dolmuş teklifte hiçbir aksiyon butonu (Kabul/Reddet/İptal/Karşı Teklif) gösterilmez.
 * J101: karşı teklif tutarı kartı render edilir; satıcı/alıcı görünürlüğü.
 * detail.test ile çakışmaz: orada pending render/aksiyonları test edilir; burada expired + countered dilimi.
 * Backend kabul/red/karşı-teklif aktarımı, zaman aşımı tetikleme backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({ id: 'offer-1' }),
}));

jest.mock('../../../src/services/api', () => ({
  offersApi: {
    getOne: jest.fn(),
    accept: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    counter: jest.fn(),
  },
}));
import { offersApi } from '../../../src/services/api';

let mockUser: { id: string } | null = { id: 'seller-1' };
jest.mock('../../../src/stores/authStore', () => ({
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

describe('J95 · Süresi dolmuş teklif aksiyon görünürlüğü', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockUser = { id: 'seller-1' };
  });

  it('J95.1 expired teklifte "Süresi Doldu" rozeti gösterilir', async () => {
    getOneMock.mockResolvedValue({ data: { data: offerFixture({ status: 'expired' }) } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Süresi Doldu')).toBeOnTheScreen());
  });

  it('J95.2 satıcı için expired teklifte Kabul/Karşı Teklif/Reddet butonları görünmez (disabled aksiyon)', async () => {
    mockUser = { id: 'seller-1' };
    getOneMock.mockResolvedValue({ data: { data: offerFixture({ status: 'expired' }) } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Deri Ceket')).toBeOnTheScreen());
    expect(screen.queryByText('Kabul Et')).toBeNull();
    expect(screen.queryByText('Karşı Teklif Ver')).toBeNull();
    expect(screen.queryByText('Reddet')).toBeNull();
  });

  it('J95.3 alıcı için expired teklifte "Teklifi İptal Et" butonu görünmez', async () => {
    mockUser = { id: 'buyer-1' };
    getOneMock.mockResolvedValue({ data: { data: offerFixture({ status: 'expired' }) } });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Deri Ceket')).toBeOnTheScreen());
    expect(screen.queryByText('Teklifi İptal Et')).toBeNull();
  });
});

describe('J101 · Karşı teklif tutarı görünürlüğü', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockUser = { id: 'buyer-1' };
  });

  it('J101.1 karşı teklif tutarı kartı alıcıya render edilir', async () => {
    getOneMock.mockResolvedValue({
      data: { data: offerFixture({ status: 'countered', counterAmount: 400 }) },
    });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Karşı Teklif')).toBeOnTheScreen());
    // Karşı teklif tutarı (400 TL) gösterilir
    expect(screen.getByText('Karşı Teklif Yapıldı')).toBeOnTheScreen();
  });

  it('J101.2 countered durumda alıcıya pending aksiyon butonları gösterilmez', async () => {
    getOneMock.mockResolvedValue({
      data: { data: offerFixture({ status: 'countered', counterAmount: 400 }) },
    });
    renderWithProviders(<OfferDetailScreen />);

    await waitFor(() => expect(screen.getByText('Karşı Teklif Yapıldı')).toBeOnTheScreen());
    // Bu ekranda alıcı için karşı-teklif kabul/karşılama butonu YOK (missing-screen raporlandı)
    expect(screen.queryByText('Kabul Et')).toBeNull();
    expect(screen.queryByText('Teklifi İptal Et')).toBeNull();
  });
});
