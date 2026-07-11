/**
 * J6 · Takas karşı teklif formu — mobil UI dilimi.
 * Nakit fark girişi (tutar + yön chip), mesaj alanı, özet render,
 * "Karşı Teklifi Gönder" buton enable/disable (ürün seçimi), ürün seçince
 * counter mutation (tradesApi.counter) çağrısı, hata/yükleme durumu.
 * Backend takas rolleri/escrow backend-only.
 */
import React from 'react';
import { appAlert } from '@tarodan/ui-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { id: 'trade-1' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/services/api', () => ({
  tradesApi: { getOne: jest.fn(), counter: jest.fn() },
  productsApi: { getAll: jest.fn() },
}));
import { tradesApi, productsApi } from '@/services/api';

let mockUser: { id: string } | null = { id: 'user-initiator' };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}));

import TradeCounterScreen from '../[id]';

const getOneMock = tradesApi.getOne as jest.Mock;
const counterMock = tradesApi.counter as jest.Mock;
const getAllMock = productsApi.getAll as jest.Mock;

function tradeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trade-1',
    status: 'pending',
    initiatorId: 'user-initiator',
    receiverId: 'user-other',
    initiatorName: 'Ali',
    receiverName: 'Veli',
    cashAmount: 0,
    cashPayerId: null,
    initiatorItems: [],
    receiverItems: [],
    ...overrides,
  };
}

const myProduct = {
  id: 'prod-mine', title: 'Benim Ürünüm', price: 200,
  isTradeEnabled: true, status: 'active', images: [],
};
const theirProduct = {
  id: 'prod-theirs', title: 'Karşı Ürün', price: 300,
  isTradeEnabled: true, status: 'active', images: [],
};

function mountWithProducts(trade = tradeFixture()) {
  getOneMock.mockResolvedValue({ data: { data: trade } });
  // İlk getAll çağrısı benim ürünlerim (sellerId=user.id), ikincisi karşı taraf.
  getAllMock.mockImplementation((params: any) => {
    const list = params?.sellerId === 'user-initiator' ? [myProduct] : [theirProduct];
    return Promise.resolve({ data: { data: list } });
  });
}

describe('J6 · Karşı teklif formu', () => {
  beforeEach(() => {
    getOneMock.mockReset();
    counterMock.mockReset();
    getAllMock.mockReset();
    mockParams = { id: 'trade-1' };
    mockUser = { id: 'user-initiator' };
    (appAlert as jest.Mock).mockImplementation(() => {});
  });

  it('J6.1 form bölümleri render edilir (nakit fark + mesaj + özet)', async () => {
    mountWithProducts();
    renderWithProviders(<TradeCounterScreen />);
    await waitFor(() => expect(screen.getByText('Nakit Fark')).toBeOnTheScreen());
    expect(screen.getByText('Ben ödeyeceğim')).toBeOnTheScreen();
    expect(screen.getByText('Karşı taraf ödesin')).toBeOnTheScreen();
    expect(screen.getByText('Özet')).toBeOnTheScreen();
  });

  it('J6.2 ürün seçili değilken "Karşı Teklifi Gönder" disabled', async () => {
    mountWithProducts();
    renderWithProviders(<TradeCounterScreen />);
    await waitFor(() => expect(screen.getByText('Vereceğim Ürünler')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Karşı Teklifi Gönder'));
    // Boş seçimde mutation tetiklenmez (disabled + handleSubmit guard).
    expect(counterMock).not.toHaveBeenCalled();
  });

  it('J6.3 ürün seçilince ve gönderince tradesApi.counter çağrılır', async () => {
    mountWithProducts();
    counterMock.mockResolvedValue({ data: {} });
    renderWithProviders(<TradeCounterScreen />);
    await waitFor(() => expect(screen.getByText('Benim Ürünüm')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Benim Ürünüm'));
    fireEvent.press(screen.getByText('Karşı Teklifi Gönder'));
    await waitFor(() => expect(counterMock).toHaveBeenCalled());
    const [tradeId, body] = counterMock.mock.calls[0];
    expect(tradeId).toBe('trade-1');
    expect(body.initiatorItems).toEqual([{ productId: 'prod-mine', quantity: 1 }]);
  });

  it('J6.4 nakit tutar girişi sadece rakam/nokta kabul eder', async () => {
    mountWithProducts();
    renderWithProviders(<TradeCounterScreen />);
    await waitFor(() => expect(screen.getByText('Nakit Fark')).toBeOnTheScreen());
    // Nakit alanı tek numeric input'tur; keyboardType ile ayırt et.
    const numericInputs = screen
      .UNSAFE_getAllByType(require('react-native').TextInput)
      .filter((n: any) => n.props.keyboardType === 'numeric');
    expect(numericInputs.length).toBe(1);
    const input = numericInputs[0];
    fireEvent.changeText(input, '12a3.5x');
    expect(screen.getByDisplayValue('123.5')).toBeOnTheScreen();
  });
});
