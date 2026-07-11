/**
 * J21 · favoriye ekle/çıkar, J57 · favori listesi temizle, J112 · favoride mi
 * (isInFavorites) / sayaç (getFavoriteCount).
 *
 * useFavorites, Faz 1'de favoritesStore'un yerini alan React Query hook'udur.
 * Eski zustand birim testinin senaryoları (idempotent ekleme, rollback, 404
 * toleransı, temizleme, isInFavorites/sayaç) burada renderHook ile korunur.
 * API katmanı mock'lanır; test edilen şey hook'un optimistic/yerel cache mantığı.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';

jest.mock('@/lib/api', () => ({
  wishlistApi: {
    get: jest.fn().mockResolvedValue({ data: { items: [] } }),
    add: jest.fn().mockResolvedValue({ data: {} }),
    remove: jest.fn().mockResolvedValue({ data: {} }),
    clear: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

import { wishlistApi } from '@/lib/api';
import { useFavorites } from '../useFavorites';

const wishlist = wishlistApi as unknown as {
  get: jest.Mock; add: jest.Mock; remove: jest.Mock; clear: jest.Mock;
};

const srvItem = (productId: string) => ({
  id: `srv-${productId}`,
  productId,
  productTitle: 'Ürün',
  productPrice: 100,
});

// children: any → test ortamındaki çift @types/react ReactNode uyuşmazlığından kaçın.
function wrapper({ children }: { children: any }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Hook'u kurar ve ilk query (boş liste) yerleşene kadar bekler. */
async function setup(initial: any[] = []) {
  wishlist.get.mockResolvedValue({ data: { items: initial } });
  const view = renderHook(() => useFavorites(), { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  wishlist.get.mockReset().mockResolvedValue({ data: { items: [] } });
  wishlist.add.mockReset().mockResolvedValue({ data: {} });
  wishlist.remove.mockReset().mockResolvedValue({ data: {} });
  wishlist.clear.mockReset().mockResolvedValue({ data: {} });
});

describe('J112 · isInFavorites / getFavoriteCount', () => {
  it('boş listede isInFavorites false, sayaç 0', async () => {
    const { result } = await setup([]);
    expect(result.current.isInFavorites('p1')).toBe(false);
    expect(result.current.getFavoriteCount()).toBe(0);
  });

  it('sunucudan gelen ürünlerde isInFavorites true, sayaç doğru', async () => {
    const { result } = await setup([srvItem('p1'), srvItem('p2')]);
    await waitFor(() => expect(result.current.getFavoriteCount()).toBe(2));
    expect(result.current.isInFavorites('p1')).toBe(true);
    expect(result.current.isInFavorites('yok')).toBe(false);
  });
});

describe('J21 · favoriye ekleme (addToFavorites optimistic)', () => {
  it('aynı ürün iki kez eklenince tek kayıt kalır (idempotent)', async () => {
    const { result } = await setup([]);
    // Ekleme sonrası refetch backend'in tek kaydını döndürür.
    wishlist.get.mockResolvedValue({ data: { items: [srvItem('p1')] } });
    await act(async () => { await result.current.addToFavorites('p1'); });
    await act(async () => { await result.current.addToFavorites('p1'); });
    await waitFor(() =>
      expect(result.current.items.filter((i) => i.productId === 'p1')).toHaveLength(1),
    );
  });

  it('ekleme başarısız olursa optimistic kayıt geri alınır (rollback)', async () => {
    const { result } = await setup([]);
    wishlist.add.mockRejectedValue({ response: { status: 500 } });
    let ok = true;
    await act(async () => { ok = await result.current.addToFavorites('p9'); });
    expect(ok).toBe(false);
    expect(result.current.isInFavorites('p9')).toBe(false);
  });
});

describe('J21 · favoriden çıkarma (removeFromFavorites)', () => {
  it('var olan ürünü yerel listeden çıkarır', async () => {
    const { result } = await setup([srvItem('p1'), srvItem('p2')]);
    await waitFor(() => expect(result.current.getFavoriteCount()).toBe(2));
    let ok = false;
    await act(async () => { ok = await result.current.removeFromFavorites('p1'); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.items.map((i) => i.productId)).toEqual(['p2']));
  });

  it('404 (zaten yok) durumunda bile başarı döner ve listeden çıkarır', async () => {
    const { result } = await setup([srvItem('p1')]);
    await waitFor(() => expect(result.current.getFavoriteCount()).toBe(1));
    wishlist.remove.mockRejectedValue({ response: { status: 404 } });
    let ok = false;
    await act(async () => { ok = await result.current.removeFromFavorites('p1'); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });
});

describe('J57 · favorileri temizleme (clearFavorites)', () => {
  it('tüm favorileri siler', async () => {
    const { result } = await setup([srvItem('p1'), srvItem('p2')]);
    await waitFor(() => expect(result.current.getFavoriteCount()).toBe(2));
    await act(async () => { await result.current.clearFavorites(); });
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });
});
