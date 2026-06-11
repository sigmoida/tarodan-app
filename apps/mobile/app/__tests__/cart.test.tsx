/**
 * J1 · sepet özeti ekranı, J22 · boş sepet, J33 · adet kontrolü UI,
 * J59 · ürün satırı çıkarma UI, J60 · checkout navigasyon wiring.
 * Sadece MOBİL-UI dilimleri (render/durum/navigasyon).
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../src/test-utils';
import { resetRouterMocks, pushMock, replaceMock } from '../../src/test-utils/router-mock';
import { useCartStore } from '../../src/stores/cartStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => require('../../src/test-utils/router-mock').routerMock);

import CartScreen from '../cart';

const seedItem = (over: Partial<any> = {}) => ({
  id: 'cart-1',
  productId: 'p1',
  title: 'Hot Wheels Mustang',
  price: 100,
  quantity: 1,
  imageUrl: 'http://x/img.png',
  seller: { id: 's1', displayName: 'Satıcı' },
  addedAt: Date.now(),
  ...over,
});

const reset = () => useCartStore.setState({ items: [], lastUpdated: Date.now(), isLoading: false });

beforeEach(() => {
  resetRouterMocks();
  reset();
});

describe('J22 · boş sepet', () => {
  it('boş sepette boş durum metni gösterilir', () => {
    renderWithProviders(<CartScreen />);
    expect(screen.getByText('Sepetiniz Boş')).toBeOnTheScreen();
  });

  it('boş sepette İlanlara Göz At ana sayfaya replace eder', () => {
    renderWithProviders(<CartScreen />);
    fireEvent.press(screen.getByText('İlanlara Göz At'));
    expect(replaceMock).toHaveBeenCalledWith('/');
  });
});

describe('J1 · sepet özeti (ürün satırı + ara toplam/kargo/toplam)', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [seedItem({ quantity: 2 })] });
  });

  it('ürün satırı render edilir', () => {
    renderWithProviders(<CartScreen />);
    expect(screen.getAllByTestId('cart-item-row')).toHaveLength(1);
    expect(screen.getByText('Hot Wheels Mustang')).toBeOnTheScreen();
  });

  it('ara toplam = price*quantity (200) gösterilir, kargo ödeme adımına bırakılır', () => {
    renderWithProviders(<CartScreen />);
    // ara toplam ₺200, kargo sepette tutara eklenmez
    expect(screen.getAllByText('₺200').length).toBeGreaterThan(0);
    expect(screen.getByText('Ödeme adımında hesaplanır')).toBeOnTheScreen();
    expect(screen.queryByText('₺49.90')).toBeNull();
  });
});

describe('J33 · adet gösterimi (UI)', () => {
  it('ürün satırında mevcut adet gösterilir', () => {
    useCartStore.setState({ items: [seedItem({ quantity: 3 })] });
    renderWithProviders(<CartScreen />);
    expect(screen.getByText('3')).toBeOnTheScreen();
  });
});

describe('J59 · ürün çıkarma (UI)', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [seedItem()] });
  });

  it('kaldır butonu (accessibilityLabel) ürünü sepetten siler', () => {
    renderWithProviders(<CartScreen />);
    fireEvent.press(screen.getByLabelText('Ürünü sepetten kaldır'));
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe('J60 · checkout navigasyon wiring', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [seedItem()] });
  });

  it('Satın Al checkout ekranına push eder', () => {
    renderWithProviders(<CartScreen />);
    fireEvent.press(screen.getByTestId('cart-checkout-button'));
    expect(pushMock).toHaveBeenCalledWith('/checkout');
  });

  it('ürün satırına tıklayınca ürün detayına push eder', () => {
    renderWithProviders(<CartScreen />);
    fireEvent.press(screen.getByText('Hot Wheels Mustang'));
    expect(pushMock).toHaveBeenCalledWith('/product/p1');
  });
});
