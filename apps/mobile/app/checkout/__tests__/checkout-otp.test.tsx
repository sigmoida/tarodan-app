/**
 * checkout-otp · Misafir OTP akışı entegrasyon testi.
 *
 * Akış:
 * 1. Sepette ürün var, konuk (isAuthenticated=false).
 * 2. Adım 1: misafir bilgileri + teslimat adresi doldur → Devam Et.
 * 3. Adım 2: Devam Et (ödeme adımı doğrulamasız ilerler).
 * 4. Adım 3: "Onayla ve Öde" → sendGuestVerificationCode çağrılır → OTP modal açılır.
 * 5. 6 haneli kodu gir → "Doğrula ve Öde" → checkoutGuest çağrılır.
 * 6. (Ekstra) 400 hatası aldığında modal açık kalır, hata mesajı görünür.
 */
import React from 'react';
import { screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

// AsyncStorage native modülü test ortamında null; resmi jest mock'u kullan.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-router mock
jest.mock('expo-router', () => require('@/test-utils/router-mock').routerMock);

// Tüm common components barrel'ı mock et:
// - CityDistrictSelector → testID'li TextInput'larla replace (modal picker'ı geçer)
// - PhoneInput → testID'li TextInput mock'u
// - ScreenHeader ve diğerleri: gerçek implementasyon (requireActual)
jest.mock('@/components/common', () => {
  const React = require('react');
  const { View, TextInput } = require('react-native');
  const actual = jest.requireActual('@/components/common');

  const MockCityDistrictSelector = ({
    city,
    district,
    onChangeCity,
    onChangeDistrict,
  }: {
    city: string;
    district: string;
    onChangeCity: (v: string) => void;
    onChangeDistrict: (v: string) => void;
  }) => (
    <View>
      <TextInput
        testID="city-input"
        value={city}
        onChangeText={(v: string) => {
          onChangeCity(v);
          onChangeDistrict('');
        }}
        placeholder="İl seçin"
      />
      <TextInput
        testID="district-input"
        value={district}
        onChangeText={onChangeDistrict}
        placeholder="İlçe seçin"
      />
    </View>
  );

  const MockPhoneInput = ({
    phone,
    onPhoneChange,
  }: {
    phone: string;
    onPhoneChange: (v: string) => void;
  }) => (
    <TextInput
      testID="phone-input"
      value={phone}
      onChangeText={onPhoneChange}
      keyboardType="phone-pad"
    />
  );

  return {
    ...actual,
    CityDistrictSelector: MockCityDistrictSelector,
    PhoneInput: MockPhoneInput,
  };
});

// API mock'ları — jest.fn() inline, sonra modülden referans alınır.
jest.mock('@/lib/api', () => ({
  ordersApi: {
    checkout: jest.fn(),
    checkoutGuest: jest.fn(() =>
      Promise.resolve({
        data: { data: { checkoutGroupId: 'g1', orders: [{ orderId: 'o1' }] } },
      }),
    ),
    sendGuestVerificationCode: jest.fn(() =>
      Promise.resolve({ data: { success: true, expiresInSeconds: 180 } }),
    ),
    getGroups: jest.fn(),
  },
  paymentsApi: {
    getPaymentMethods: jest.fn(() => Promise.resolve({ data: [] })),
    initiateGroup: jest.fn(),
    initiateGroupGuest: jest.fn(() =>
      Promise.resolve({ data: { data: { useBypass: true, paymentId: 'p1' } } }),
    ),
    bypassComplete: jest.fn(() => Promise.resolve({ data: {} })),
  },
  shippingApi: { getRatesByCity: jest.fn(() => Promise.resolve({ data: { rate: 34.9 } })) },
  addressesApi: { getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  discountsApi: { validate: jest.fn() },
}));

// Konuk akışı: isAuthenticated=false
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: false, user: null }),
}));

import { ordersApi } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { replaceMock } from '@/test-utils/router-mock';
import CheckoutScreen from '../index';

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

const seedCart = (items: any[]) => useCartStore.setState({ items, lastUpdated: Date.now() });

/** Adım 1 için tüm zorunlu alanları doldur. */
function fillAllStep1Fields() {
  // PhoneInput mock'ları: iki tane var (guestPhone + shippingAddress.phone)
  const phoneInputs = screen.getAllByTestId('phone-input');
  // [0] = guestPhone, [1] = shippingAddress.phone
  fireEvent.changeText(phoneInputs[0], '5321234567');
  // shippingAddress.phone boş bırakılabilir (validateStep1 guestPhone'u fallback kullanır)

  // CityDistrictSelector mock
  fireEvent.changeText(screen.getByTestId('city-input'), 'İstanbul');
  fireEvent.changeText(screen.getByTestId('district-input'), 'Kadıköy');

  // testID tabanlı sorgular — render sırasından bağımsız, kırılganlık giderildi.
  fireEvent.changeText(screen.getByTestId('guest-name-input'), 'Ali Veli');
  fireEvent.changeText(screen.getByTestId('guest-email-input'), 'ali@example.com');
  fireEvent.changeText(screen.getByTestId('shipping-fullname-input'), 'Ali Veli');
  fireEvent.changeText(screen.getByTestId('shipping-address-input'), 'Test Sokak No:1');
}

describe('Misafir checkout OTP akışı', () => {
  beforeEach(() => {
    jest.mocked(ordersApi.sendGuestVerificationCode).mockClear();
    jest.mocked(ordersApi.checkoutGuest).mockClear();
    seedCart([SAMPLE_ITEM]);
  });

  afterEach(() => {
    useCartStore.setState({ items: [] });
  });

  it('geçerli misafir formu + ödeme → OTP gönderir, kod ile checkoutGuest çağrılır', async () => {
    renderWithProviders(<CheckoutScreen />);

    // --- Adım 1: Misafir bilgileri + Teslimat adresi ---
    fillAllStep1Fields();

    // Devam Et → Step 2
    fireEvent.press(screen.getByText('Devam Et'));

    // Validasyon hatası yoksa Step 2'ye geçildi ("Devam Et" hala görünür)
    await waitFor(() => {
      expect(screen.getByText('Devam Et')).toBeOnTheScreen();
    });

    // Step 2'de Devam Et → Step 3
    fireEvent.press(screen.getByText('Devam Et'));

    await waitFor(() => {
      // Step 3'te "Onayla ve Öde" butonu görünmeli
      expect(screen.getByText(/Onayla ve Öde/)).toBeOnTheScreen();
    });

    // --- Adım 3: Onayla ve Öde → OTP gönderilir ---
    await act(async () => {
      fireEvent.press(screen.getByText(/Onayla ve Öde/));
    });

    await waitFor(() => {
      expect(ordersApi.sendGuestVerificationCode).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ali@example.com',
          expectedCheckoutCount: 1,
        }),
      );
    });

    // OTP modal açıldı: guest-otp-input görünmeli
    await waitFor(() => {
      expect(screen.getByTestId('guest-otp-input')).toBeOnTheScreen();
    });

    // 6 haneli kodu gir
    fireEvent.changeText(screen.getByTestId('guest-otp-input'), '123456');

    // "Doğrula ve Öde" butonuna bas
    await act(async () => {
      fireEvent.press(screen.getByTestId('guest-otp-submit'));
    });

    // checkoutGuest emailVerificationCode ile çağrılmalı
    await waitFor(() => {
      expect(ordersApi.checkoutGuest).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerificationCode: '123456' }),
      );
    });
  });

  it('stok bitti (400, stok keyword) → OTP modal KAPANIR, unavailable sayfasına redirect edilir', async () => {
    // checkoutGuest stok hatası ile 400 döndürüyor — STOCKOUT_KEYWORDS'den bir keyword içeriyor
    jest.mocked(ordersApi.checkoutGuest).mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          message: 'Bu ürün başkası tarafından satın alındı.',
          productId: 'prod-1234567890',
        },
      },
    });

    replaceMock.mockClear();

    renderWithProviders(<CheckoutScreen />);

    fillAllStep1Fields();

    fireEvent.press(screen.getByText('Devam Et'));
    await waitFor(() => expect(screen.getByText('Devam Et')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Devam Et'));
    await waitFor(() => expect(screen.getByText(/Onayla ve Öde/)).toBeOnTheScreen());

    await act(async () => {
      fireEvent.press(screen.getByText(/Onayla ve Öde/));
    });

    await waitFor(() => expect(screen.getByTestId('guest-otp-input')).toBeOnTheScreen());

    fireEvent.changeText(screen.getByTestId('guest-otp-input'), '123456');
    await act(async () => {
      fireEvent.press(screen.getByTestId('guest-otp-submit'));
    });

    // Stok 400 → OTP modal'da hata mesajı gösterilmemeli; redirect çalışmalı
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/products/unavailable/[productId]',
          params: expect.objectContaining({ productId: 'prod-1234567890' }),
        }),
      );
    });
    // guest-otp-input ekranda değil (modal kapandı / navigate etti)
    expect(screen.queryByText('Bu ürün başkası tarafından satın alındı.')).toBeNull();
  });

  it('yanlış kod (400) → modal açık kalır, hata mesajı görünür', async () => {
    // checkoutGuest 400 döndürsün
    jest.mocked(ordersApi.checkoutGuest).mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'Doğrulama kodu geçersiz.' },
      },
    });

    renderWithProviders(<CheckoutScreen />);

    fillAllStep1Fields();

    fireEvent.press(screen.getByText('Devam Et'));
    await waitFor(() => expect(screen.getByText('Devam Et')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Devam Et'));
    await waitFor(() => expect(screen.getByText(/Onayla ve Öde/)).toBeOnTheScreen());

    await act(async () => {
      fireEvent.press(screen.getByText(/Onayla ve Öde/));
    });

    await waitFor(() => expect(screen.getByTestId('guest-otp-input')).toBeOnTheScreen());

    fireEvent.changeText(screen.getByTestId('guest-otp-input'), '999999');
    await act(async () => {
      fireEvent.press(screen.getByTestId('guest-otp-submit'));
    });

    // 400 → modal açık kalmalı (guest-otp-input hala görünür) + hata mesajı
    await waitFor(() => {
      expect(screen.getByTestId('guest-otp-input')).toBeOnTheScreen();
      expect(screen.getByText('Doğrulama kodu geçersiz.')).toBeOnTheScreen();
    });
  });
});
