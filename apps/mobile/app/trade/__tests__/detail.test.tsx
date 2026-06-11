/**
 * J5/J35 · Takas detayı — mobil UI dilimi.
 * Durum rozetleri (pending/accepted/awaiting_payment/shipping_to_warehouse/returning),
 * aksiyon buton görünürlüğü (receiver pending → Kabul Et/Karşı Teklif/Reddet),
 * ödeme butonu wiring (cash-pay-button → paymentsApi.initiateTradeCash → router.push /payment/[id]),
 * takas bulunamadı durumu.
 * Backend escrow/depo/dispute aktarımı backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

// i18n: provider olmadan t() passthrough (son segmenti döndürür).
jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    language: 'tr',
  }),
}));

let mockParams: Record<string, string> = { id: 'trade-1' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));
import { router } from 'expo-router';
const mockPush = router.push as jest.Mock;

jest.mock('../../../src/services/api', () => ({
  tradesApi: {
    getOne: jest.fn(),
    accept: jest.fn(),
    reject: jest.fn(),
    confirmReceipt: jest.fn(),
    cancel: jest.fn(),
    raiseDispute: jest.fn(),
  },
  paymentsApi: { initiateTradeCash: jest.fn() },
}));
import { tradesApi, paymentsApi } from '../../../src/services/api';

// Bu ekran useAuthStore().user'a göre initiator/receiver ayrımı yapar.
let mockUser: { id: string } | null = { id: 'user-receiver' };
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

import TradeDetailScreen from '../[id]';

const getOneMock = tradesApi.getOne as jest.Mock;
const cashPayMock = paymentsApi.initiateTradeCash as jest.Mock;

function tradeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trade-1',
    tradeNumber: 'TKS-501',
    status: 'pending',
    initiatorId: 'user-initiator',
    receiverId: 'user-receiver',
    initiatorName: 'Ali',
    receiverName: 'Veli',
    cashAmount: null,
    cashPayerId: null,
    initiatorMessage: null,
    receiverMessage: null,
    responseDeadline: null,
    initiatorShippedAt: null,
    receiverShippedAt: null,
    initiatorTrackingNumber: null,
    receiverTrackingNumber: null,
    completedAt: null,
    createdAt: new Date('2026-01-01').toISOString(),
    initiatorItems: [],
    receiverItems: [],
    shipments: [],
    cashPayment: null,
    ...overrides,
  };
}

describe('J5 · Takas detayı durum rozetleri', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockPush.mockReset();
    mockParams = { id: 'trade-1' };
    mockUser = { id: 'user-receiver' };
  });

  it('J5.1 takas numarası ve "Bekliyor" rozeti gösterilir', async () => {
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'pending' }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Bekliyor').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Takas #TKS-501').length).toBeGreaterThan(0);
  });

  it('J5.2 accepted → "Kabul Edildi" rozeti', async () => {
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'accepted' }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Kabul Edildi').length).toBeGreaterThan(0));
  });

  it('J5.3 shipping_to_warehouse → "Depoya Gönderim" rozeti', async () => {
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'shipping_to_warehouse' }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Depoya Gönderim').length).toBeGreaterThan(0));
  });

  it('J5.4 returning → "İade Sürecinde" rozeti + iade banner', async () => {
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'returning' }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('İade Sürecinde').length).toBeGreaterThan(0));
    expect(screen.getByText('Takas Reddedildi')).toBeOnTheScreen();
  });

  it('J5.5 takas bulunamazsa hata durumu gösterilir', async () => {
    getOneMock.mockRejectedValue(new Error('not found'));
    renderWithProviders(<TradeDetailScreen />);
    expect(await screen.findByText('Takas bulunamadı')).toBeOnTheScreen();
  });
});

describe('J5 · Aksiyon buton görünürlüğü', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    mockPush.mockReset();
    mockParams = { id: 'trade-1' };
    mockUser = { id: 'user-receiver' };
  });

  it('J5.6 receiver + pending → Kabul Et / Karşı Teklif / Reddet görünür', async () => {
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'pending' }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getByText('Kabul Et')).toBeOnTheScreen());
    expect(screen.getByText('Karşı Teklif')).toBeOnTheScreen();
    expect(screen.getByText('Reddet')).toBeOnTheScreen();
  });

  it('J5.7 initiator + pending → Kabul Et butonu görünmez', async () => {
    mockUser = { id: 'user-initiator' };
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'pending' }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('Takas #TKS-501').length).toBeGreaterThan(0));
    expect(screen.queryByText('Kabul Et')).toBeNull();
  });

  it('J5.9 receiver + pending → "Teklifi İptal Et" görünmez (aksiyonu Reddet)', async () => {
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'pending', canCancel: true }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getByText('Reddet')).toBeOnTheScreen());
    expect(screen.queryByText('trade.cancel.offerCta')).toBeNull();
  });

  it('J5.10 initiator + pending → "Teklifi İptal Et" görünür', async () => {
    mockUser = { id: 'user-initiator' };
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'pending', canCancel: true }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getByText('trade.cancel.offerCta')).toBeOnTheScreen());
    expect(screen.queryByText('Reddet')).toBeNull();
  });

  it('J5.8 "Karşı Teklif" → router.push counter ekranına', async () => {
    getOneMock.mockResolvedValue({ data: { data: tradeFixture({ status: 'pending' }) } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getByText('Karşı Teklif')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Karşı Teklif'));
    expect(mockPush).toHaveBeenCalledWith('/trade/counter/trade-1');
  });
});

describe('J7 · Ödeme butonu wiring', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    cashPayMock.mockReset();
    mockPush.mockReset();
    mockParams = { id: 'trade-1' };
    mockUser = { id: 'user-receiver' };
  });

  it('J7.1 awaiting_payment + cashPayer ben → "Ödeme Yap" butonu görünür', async () => {
    getOneMock.mockResolvedValue({
      data: { data: tradeFixture({ status: 'awaiting_payment', cashAmount: 500, cashPayerId: 'user-receiver' }) },
    });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('cash-pay-button')).toBeOnTheScreen());
  });

  it('J7.2 cashPayer karşı taraf → ödeme butonu yerine bekleme metni', async () => {
    getOneMock.mockResolvedValue({
      data: { data: tradeFixture({ status: 'awaiting_payment', cashAmount: 500, cashPayerId: 'user-initiator' }) },
    });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() =>
      expect(screen.getByText('Karşı tarafın nakit fark ödemesi bekleniyor.')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('cash-pay-button')).toBeNull();
  });

  it('J7.3 "Ödeme Yap" basınca initiateTradeCash çağrılır ve paymentId ile /payment/[id]\'e push eder', async () => {
    getOneMock.mockResolvedValue({
      data: { data: tradeFixture({ status: 'awaiting_payment', cashAmount: 500, cashPayerId: 'user-receiver' }) },
    });
    cashPayMock.mockResolvedValue({ data: { data: { paymentId: 'pay-9', paymentUrl: 'https://pay' } } });
    renderWithProviders(<TradeDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('cash-pay-button')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('cash-pay-button'));
    await waitFor(() => expect(cashPayMock).toHaveBeenCalledWith('trade-1'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/payment/[id]',
          params: expect.objectContaining({ id: 'pay-9', tradeId: 'trade-1' }),
        }),
      ),
    );
  });
});
