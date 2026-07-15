/**
 * J2/J18/J55/J56 · İlan oluşturma formu (ListingForm, mode="create") — mobil UI dilimi.
 * Form validasyonu (başlık<5, fiyat<1, boş başlık) → appAlert uyarısı + submit ENGELLENİR,
 * submit butonu render, komisyon önizleme bölümü (fiyat girişi → /orders/commission-preview).
 *
 * NOT: Bu form inline doğrulamayı appAlert ile yapar (testID'li hata banner'ı YOK),
 * bu yüzden uyarı Alert spy üzerinden + productsApi.create'in ÇAĞRILMADIĞI ile doğrulanır.
 * Foto zorunluluğu validate() içinde ("En az bir fotoğraf ekleyin"): galeri seçimi
 * native ImagePicker gerektirdiği için happy-path create akışı (gerçek foto upload) E2E/backend.
 * Backend (komisyon hesabı, ilan oluşturma kalıcılığı, limit zorlaması) backendOnly.
 */
import React from 'react';
import { appAlert } from '@tarodan/ui-native';
import {  } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test-utils';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  MediaTypeOptions: { Images: 'Images' },
}));

const mockGet = jest.fn();
jest.mock('@/lib/api', () => ({
  api: { get: (...a: any[]) => mockGet(...a), post: jest.fn(), patch: jest.fn() },
  productsApi: {
    create: jest.fn(async () => ({ data: {} })),
    update: jest.fn(),
    getMyListings: jest.fn(),
    getMyStats: jest.fn(),
    getMyById: jest.fn(),
    delete: jest.fn(),
  },
  categoriesApi: { getAll: jest.fn(async () => ({ data: { data: [] } })) },
  bankAccountApi: {
    get: jest.fn(async () => ({
      data: { id: 'x', accountHolder: 'Test User', iban: 'TR000000000000000000000001', isVerified: false },
    })),
  },
}));
import { api, productsApi } from '@/lib/api';

jest.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { membershipTier: 'free', listingCount: 0 },
    limits: { maxListings: 10, maxImagesPerListing: 5, canTrade: false },
    refreshUserData: jest.fn(async () => {}),
  }),
}));

import ListingForm from '../ListingForm';

const mockCreate = productsApi.create as jest.Mock;

// api.get yönlendirmesi: endpoint'e göre cevap ver.
function wireApi(commission?: { sellerFeeAmount: number; sellerNetAmount: number }) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/products/filters') {
      return Promise.resolve({ data: { scales: [], materials: [], brands: [], manufacturers: [] } });
    }
    if (url === '/products/my/stats') {
      return Promise.resolve({
        data: {
          limits: { tierName: 'Free', tierType: 'free' },
          summary: { max: 10, used: 0, remaining: 10, canCreate: true },
        },
      });
    }
    if (url === '/orders/commission-preview') {
      return Promise.resolve({ data: commission ?? { sellerFeeAmount: 10, sellerNetAmount: 90 } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe('J2 · İlan formu render + submit butonu', () => {
  let alertSpy: jest.Mock;
  beforeEach(() => {
    mockGet.mockReset();
    mockCreate.mockClear();
    wireApi();
    alertSpy = (appAlert as jest.Mock).mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('J2.1 form başlığı ve "İlanı Oluştur" submit butonu görünür', async () => {
    renderWithProviders(<ListingForm mode="create" />);
    expect(await screen.findByText('Yeni İlan Oluştur')).toBeOnTheScreen();
    expect(screen.getByText('İlanı Oluştur')).toBeOnTheScreen();
  });
});

describe('J18/J55 · ilan formu input validasyonu', () => {
  let alertSpy: jest.Mock;
  beforeEach(() => {
    mockGet.mockReset();
    mockCreate.mockClear();
    wireApi();
    alertSpy = (appAlert as jest.Mock).mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('J55.1 boş başlık → submit reddedilir, "Başlık en az 5 karakter" uyarısı', async () => {
    renderWithProviders(<ListingForm mode="create" />);
    await screen.findByText('İlanı Oluştur');
    fireEvent.press(screen.getByText('İlanı Oluştur'));
    expect(alertSpy).toHaveBeenCalledWith('Hata', 'Başlık en az 5 karakter olmalıdır.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('J55.2 başlık<5 karakter → reddedilir', async () => {
    renderWithProviders(<ListingForm mode="create" />);
    await screen.findByText('İlanı Oluştur');
    fireEvent.changeText(screen.getByPlaceholderText("Örn: Hot Wheels '69 Camaro Z28"), 'Abc');
    fireEvent.press(screen.getByText('İlanı Oluştur'));
    expect(alertSpy).toHaveBeenCalledWith('Hata', 'Başlık en az 5 karakter olmalıdır.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('J55.3 geçerli başlık + fiyat<1 → "Geçerli bir fiyat giriniz" uyarısı, reddedilir', async () => {
    renderWithProviders(<ListingForm mode="create" />);
    await screen.findByText('İlanı Oluştur');
    fireEvent.changeText(screen.getByPlaceholderText("Örn: Hot Wheels '69 Camaro Z28"), 'Geçerli Başlık');
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '0');
    fireEvent.press(screen.getByText('İlanı Oluştur'));
    expect(alertSpy).toHaveBeenCalledWith('Hata', 'Geçerli bir fiyat giriniz.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('J55.4 başlık+fiyat geçerli, kategori/foto yok → kategori uyarısı (create yine çağrılmaz)', async () => {
    renderWithProviders(<ListingForm mode="create" />);
    await screen.findByText('İlanı Oluştur');
    fireEvent.changeText(screen.getByPlaceholderText("Örn: Hot Wheels '69 Camaro Z28"), 'Geçerli Başlık');
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '150');
    fireEvent.press(screen.getByText('İlanı Oluştur'));
    expect(alertSpy).toHaveBeenCalledWith('Hata', 'Lütfen bir kategori seçin.');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('J56 · komisyon önizleme bölümü', () => {
  let alertSpy: jest.Mock;
  beforeEach(() => {
    mockGet.mockReset();
    wireApi({ sellerFeeAmount: 25, sellerNetAmount: 475 });
    alertSpy = (appAlert as jest.Mock).mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('J56.1 fiyat girilince komisyon önizleme bölümü (kesinti + net kazanç) render olur', async () => {
    renderWithProviders(<ListingForm mode="create" />);
    await screen.findByText('İlanı Oluştur');
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
    await waitFor(
      () => expect(screen.getByText('Tahmini (satış başına)')).toBeOnTheScreen(),
      { timeout: 3000 },
    );
    expect(screen.getByText(/Platform kesintisi/)).toBeOnTheScreen();
    expect(screen.getByText(/Net kazanç/)).toBeOnTheScreen();
  });

  it('J56.2 fiyat boş/0 ise komisyon önizleme bölümü görünmez', async () => {
    renderWithProviders(<ListingForm mode="create" />);
    await screen.findByText('İlanı Oluştur');
    expect(screen.queryByText('Tahmini (satış başına)')).toBeNull();
  });
});
