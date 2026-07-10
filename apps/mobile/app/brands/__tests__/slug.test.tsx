/**
 * J12 · Marka detay/liste ekranı — mobil UI dilimi.
 * Marka adı başlık + header render, ürün grid listesi, boş durum (ürün yok),
 * hata durumu (Ürünler yüklenemedi).
 * Backend ürün filtreleme/sayım mantığı backend-only.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

let mockParams: Record<string, string> = { slug: 'hot-wheels' };
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/services/api', () => ({
  brandsApi: { findBySlug: jest.fn() },
  productsApi: { getAll: jest.fn() },
}));
import { brandsApi, productsApi } from '@/services/api';

import BrandDetailScreen from '../[slug]';

const findBySlug = brandsApi.findBySlug as jest.Mock;
const getAll = productsApi.getAll as jest.Mock;

function productFixture(over: Record<string, unknown> = {}) {
  return { id: 'p1', title: 'Mustang GT', price: 950, images: [], status: 'active', ...over };
}

describe('J12 · Marka detay', () => {
  beforeEach(() => {
    findBySlug.mockReset();
    getAll.mockReset();
    mockParams = { slug: 'hot-wheels' };
  });

  it('J12.5 marka adı header ve ürünler listelenir', async () => {
    findBySlug.mockResolvedValue({ data: { data: { id: 'b1', name: 'Hot Wheels', slug: 'hot-wheels', productCount: 2 } } });
    getAll.mockResolvedValue({ data: { data: [productFixture(), productFixture({ id: 'p2', title: 'Camaro SS' })] } });
    renderWithProviders(<BrandDetailScreen />);

    await waitFor(() => expect(screen.getByText('2 ürün')).toBeOnTheScreen());
    expect(await screen.findByText('Mustang GT')).toBeOnTheScreen();
    expect(screen.getByText('Camaro SS')).toBeOnTheScreen();
  });

  it('J12.6 markaya ait ürün yoksa boş durum gösterilir', async () => {
    findBySlug.mockResolvedValue({ data: { data: { id: 'b1', name: 'Hot Wheels', slug: 'hot-wheels' } } });
    getAll.mockResolvedValue({ data: { data: [] } });
    renderWithProviders(<BrandDetailScreen />);

    expect(await screen.findByText('Bu markaya ait ürün yok')).toBeOnTheScreen();
  });

  it('J12.7 ürünler yüklenemezse hata mesajı gösterilir', async () => {
    findBySlug.mockResolvedValue({ data: { data: { id: 'b1', name: 'Hot Wheels', slug: 'hot-wheels' } } });
    getAll.mockRejectedValue(new Error('boom'));
    renderWithProviders(<BrandDetailScreen />);

    expect(await screen.findByText('Ürünler yüklenemedi.')).toBeOnTheScreen();
  });
});
