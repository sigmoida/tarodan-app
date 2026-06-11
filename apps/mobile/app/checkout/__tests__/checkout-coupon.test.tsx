/**
 * J58 · Checkout kupon (couponCode) — MOBİL-UI dilimi (adım 2 / Ödeme).
 * Test edilen: kupon input render, boş kuponda "Uygula" pasif, geçersiz kuponda
 * hata snackbar gösterimi, başarılı kuponda uygulanmış kupon rozeti.
 * Backend indirim hesaplama/doğrulama backend-only (discountsApi.validate mock'lanır).
 * Mevcut checkout.test (3-step, guest, adım1) ile ÇAKIŞMA yok: bu dosya yalnız
 * adım 2 kupon dilimini test eder (üye + kayıtlı adres ile step2'ye geçer).
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => require('../../../src/test-utils/router-mock').routerMock);

jest.mock('../../../src/services/api', () => ({
  ordersApi: { directBuy: jest.fn(), createGuest: jest.fn() },
  paymentsApi: {
    getPaymentMethods: jest.fn(() => Promise.resolve({ data: [] })),
    processDirect: jest.fn(),
    initiate: jest.fn(),
    initiateGuest: jest.fn(),
    bypassComplete: jest.fn(),
  },
  shippingApi: {
    getRatesByCity: jest.fn(() => Promise.resolve({ data: { rate: 34.9 } })),
  },
  addressesApi: {
    getAll: jest.fn(() =>
      Promise.resolve({
        data: [
          {
            id: 'addr-1',
            title: 'Ev',
            fullName: 'Ayşe Yılmaz',
            phone: '05001112233',
            city: 'İstanbul',
            district: 'Kadıköy',
            address: 'Bağdat Cad. 1',
            isDefault: true,
          },
        ],
      }),
    ),
  },
  discountsApi: { validate: jest.fn() },
}));

// Üye kullanıcı → kayıtlı adres otomatik seçilir, step2'ye geçilebilir.
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { id: 'me' } }),
}));

import { discountsApi } from '../../../src/services/api';
import { useCartStore } from '../../../src/stores/cartStore';
import CheckoutScreen from '../index';

const validateMock = discountsApi.validate as jest.Mock;

const SAMPLE_ITEM = {
  id: 'cart-1',
  productId: 'prod-1234567890',
  title: 'Test Model Araba',
  price: 100,
  quantity: 1,
  imageUrl: 'https://x/y.jpg',
  brand: 'Bburago',
  scale: '1:18',
  seller: { id: 's1', displayName: 'Satıcı' },
  addedAt: Date.now(),
};

const seedCart = () =>
  useCartStore.setState({ items: [SAMPLE_ITEM], lastUpdated: Date.now() });

// Üye + kayıtlı adres seçili → adım 2'ye (Ödeme) geç.
async function goToStep2() {
  await waitFor(() => expect(screen.getByText('Ev')).toBeOnTheScreen());
  fireEvent.press(screen.getByText('Devam Et'));
  await waitFor(() => expect(screen.getByText('İndirim Kuponu')).toBeOnTheScreen());
}

describe('J58 · checkout kupon (couponCode)', () => {
  beforeEach(() => validateMock.mockReset());
  afterEach(() => useCartStore.setState({ items: [] }));

  it('J58.1 adım 2 kupon input render edilir, boş kuponda Uygula pasif', async () => {
    seedCart();
    renderWithProviders(<CheckoutScreen />);
    await goToStep2();
    expect(screen.getByPlaceholderText('Kupon kodu')).toBeOnTheScreen();
    // Boş kupon → handleApplyCoupon erken döner (validate çağrılmaz)
    fireEvent.press(screen.getByText('Uygula'));
    expect(validateMock).not.toHaveBeenCalled();
  });

  it('J58.2 geçersiz kupon → hata snackbar gösterilir', async () => {
    seedCart();
    validateMock.mockRejectedValue({
      response: { data: { message: 'Kupon geçersiz.' } },
    });
    renderWithProviders(<CheckoutScreen />);
    await goToStep2();

    fireEvent.changeText(screen.getByPlaceholderText('Kupon kodu'), 'YOK10');
    fireEvent.press(screen.getByText('Uygula'));

    await waitFor(() =>
      expect(screen.getByText('Kupon geçersiz.')).toBeOnTheScreen(),
    );
  });

  it('J58.3 geçerli kupon → uygulanan kupon rozeti + Kaldır görünür', async () => {
    seedCart();
    validateMock.mockResolvedValue({ data: { discountAmount: 25 } });
    renderWithProviders(<CheckoutScreen />);
    await goToStep2();

    fireEvent.changeText(screen.getByPlaceholderText('Kupon kodu'), 'INDIRIM25');
    fireEvent.press(screen.getByText('Uygula'));

    await waitFor(() =>
      expect(validateMock).toHaveBeenCalled(),
    );
    await waitFor(() => expect(screen.getByText('Kaldır')).toBeOnTheScreen());
  });
});
