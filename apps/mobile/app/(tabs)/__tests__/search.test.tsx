/**
 * J52 · Katalog/arama: sonuç listesi render, boş durum.
 * J53 · Arama input + fiyat/sıralama filtre UI wiring (mobil-UI dilimleri).
 * Backend arama/sıralama mantığı backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';
import { resetRouterMocks, pushMock } from '../../../src/test-utils/router-mock';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => require('../../../src/test-utils/router-mock').routerMock);

jest.mock('../../../src/services/api', () => ({
  productsApi: { getAll: jest.fn() },
  searchApi: { autocompleteRich: jest.fn() },
}));
import { productsApi } from '../../../src/services/api';

// Filtre seçenekleri ağ çağrısı yapmasın (mobil-UI testi backend-bağımsız).
jest.mock('../../../src/hooks/useProductFilterOptions', () => ({
  useProductFilterOptions: () => ({ manufacturers: [], brands: [], categories: [] }),
}));

// Ağır filtre sheet'i render dışı bırak (kendi testi var).
jest.mock('../../../src/components/ProductFilterSheet', () => () => null);

import SearchScreen from '../search';

const mockGetAll = productsApi.getAll as jest.Mock;

const makeProduct = (id: string, title: string) => ({
  id,
  title,
  brand: 'Hot Wheels',
  scale: '1:64',
  price: 199,
  images: [],
});

const mockListResponse = (items: any[]) => ({
  data: {
    items,
    meta: { page: 1, totalPages: 1, total: items.length },
  },
});

describe('catalog-search · arama ekranı (J52/J53)', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    resetRouterMocks();
  });

  it('J52 · arama kutusu render olur', async () => {
    mockGetAll.mockResolvedValue(mockListResponse([]));
    renderWithProviders(<SearchScreen />);
    expect(screen.getByTestId('search-input')).toBeOnTheScreen();
  });

  it('J52 · sonuçlar gelince ürün kartları ve sonuç sayısı görünür', async () => {
    mockGetAll.mockResolvedValue(
      mockListResponse([makeProduct('p1', 'Ferrari F40'), makeProduct('p2', 'Lamborghini')]),
    );
    renderWithProviders(<SearchScreen />);

    await waitFor(() =>
      expect(screen.getAllByTestId('search-result-card').length).toBe(2),
    );
    expect(screen.getByText('Ferrari F40')).toBeOnTheScreen();
    expect(screen.getByText('2 sonuç bulundu')).toBeOnTheScreen();
  });

  it('J52 · boş sonuç → "Sonuç Bulunamadı" boş durumu görünür', async () => {
    mockGetAll.mockResolvedValue(mockListResponse([]));
    renderWithProviders(<SearchScreen />);

    await waitFor(() =>
      expect(screen.getByText('Sonuç Bulunamadı')).toBeOnTheScreen(),
    );
    expect(screen.getByText('0 sonuç bulundu')).toBeOnTheScreen();
  });

  it('J53 · arama kutusuna yazınca değer ekrana yansır', async () => {
    mockGetAll.mockResolvedValue(mockListResponse([]));
    renderWithProviders(<SearchScreen />);

    const input = screen.getByTestId('search-input');
    fireEvent.changeText(input, 'ferrari');
    expect(input.props.value).toBe('ferrari');
  });

  it('J53 · ürün kartına basınca ürün detayına navigasyon yapılır', async () => {
    mockGetAll.mockResolvedValue(mockListResponse([makeProduct('p1', 'Ferrari F40')]));
    renderWithProviders(<SearchScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('search-result-card')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('search-result-card'));
    expect(pushMock).toHaveBeenCalledWith('/product/p1');
  });
});
