/**
 * J12 · Kategori liste ekranı — mobil UI dilimi.
 * Başlık render, ürün kartları listesi + sonuç sayısı, boş/bulunamadı durumu,
 * ürün karta basınca router.push wiring, geri butonu.
 * Backend filtre/sıralama mantığı (sortBy server param) backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { slug: 'arabalar' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
import { router } from 'expo-router';

jest.mock('@/services/api', () => ({
  categoriesApi: { getBySlug: jest.fn() },
  productsApi: { getAll: jest.fn() },
}));
import { categoriesApi, productsApi } from '@/services/api';

import CategoryScreen from '../[slug]';

const pushMock = router.push as jest.Mock;
const backMock = router.back as jest.Mock;
const getBySlug = categoriesApi.getBySlug as jest.Mock;
const getAll = productsApi.getAll as jest.Mock;

function productFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', title: 'Kırmızı Araba', price: 1200, brand: 'Hot Wheels',
    scale: '1:64', images: [], viewCount: 5, status: 'active', quantity: 1, ...over,
  };
}

describe('J12 · Kategori liste', () => {
  beforeEach(() => {
    getBySlug.mockReset();
    getAll.mockReset();
    pushMock.mockReset();
    backMock.mockReset();
    mockParams = { slug: 'arabalar' };
  });

  it('J12.1 kategori adı başlıkta ve ürünler listelenir', async () => {
    getBySlug.mockResolvedValue({ data: { category: { id: 'c1', name: 'Arabalar' } } });
    getAll.mockResolvedValue({ data: { data: [productFixture(), productFixture({ id: 'p2', title: 'Mavi Araba' })] } });
    renderWithProviders(<CategoryScreen />);

    await waitFor(() => expect(screen.getByText('Arabalar')).toBeOnTheScreen());
    expect(await screen.findByText('Kırmızı Araba')).toBeOnTheScreen();
    expect(screen.getByText('Mavi Araba')).toBeOnTheScreen();
    expect(screen.getByText('2 ürün bulundu')).toBeOnTheScreen();
  });

  it('J12.2 kategoride ürün yoksa bulunamadı durumu gösterilir', async () => {
    getBySlug.mockResolvedValue({ data: { category: { id: 'c1', name: 'Arabalar' } } });
    getAll.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<CategoryScreen />);

    expect(await screen.findByText('Ürün bulunamadı')).toBeOnTheScreen();
    expect(screen.getByText('Bu kategoride henüz ürün yok')).toBeOnTheScreen();
  });

  it('J12.3 ürün kartına basınca ürün detayına yönlendirir', async () => {
    getBySlug.mockResolvedValue({ data: { category: { id: 'c1', name: 'Arabalar' } } });
    getAll.mockResolvedValue({ data: { data: [productFixture()] } });
    renderWithProviders(<CategoryScreen />);

    fireEvent.press(await screen.findByText('Kırmızı Araba'));
    expect(pushMock).toHaveBeenCalledWith('/product/p1');
  });

  it('J12.4 geri butonu router.back çağırır', async () => {
    getBySlug.mockResolvedValue({ data: { category: { id: 'c1', name: 'Arabalar' } } });
    getAll.mockResolvedValue({ data: { data: [] } });
    (router.canGoBack as jest.Mock).mockReturnValue(true);
    renderWithProviders(<CategoryScreen />);
    await screen.findByText('Arabalar');

    fireEvent.press(screen.getByLabelText('Geri'));
    expect(backMock).toHaveBeenCalled();
  });
});
