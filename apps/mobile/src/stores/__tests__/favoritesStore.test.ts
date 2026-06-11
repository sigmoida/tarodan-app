/**
 * J21 · favoriye ekle/çıkar, J57 · favori listesi tek kayıt/temizle,
 * J112 · favoride mi (isInFavorites) / sayaç (getFavoriteCount).
 * favoritesStore zustand birim testi (getState). API katmanı mock'lanır;
 * test edilen şey: store'un yerel state mantığı (idempotent ekleme, çıkarma, temizleme, sayaç).
 */
jest.mock('../../services/api', () => ({
  wishlistApi: {
    get: jest.fn().mockResolvedValue({ data: { items: [] } }),
    add: jest.fn().mockResolvedValue({ data: {} }),
    remove: jest.fn().mockResolvedValue({ data: {} }),
    clear: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { useFavoritesStore, WishlistItem } from '../favoritesStore';
import { wishlistApi } from '../../services/api';

const reset = () => useFavoritesStore.setState({ items: [], isLoading: false, error: null });

const makeItem = (productId: string): WishlistItem => ({
  id: `id-${productId}`,
  productId,
  product: {
    id: productId,
    title: 'Ürün',
    price: 100,
    images: [],
    condition: 'good',
    status: 'active',
    seller: { id: 's1', displayName: 'Satıcı' },
  },
  addedAt: new Date().toISOString(),
});

describe('J112 · isInFavorites / getFavoriteCount (saf yardımcılar)', () => {
  beforeEach(reset);

  it('boş listede isInFavorites false, sayaç 0', () => {
    const s = useFavoritesStore.getState();
    expect(s.isInFavorites('p1')).toBe(false);
    expect(s.getFavoriteCount()).toBe(0);
  });

  it('üründe varsa isInFavorites true, sayaç doğru', () => {
    useFavoritesStore.setState({ items: [makeItem('p1'), makeItem('p2')] });
    const s = useFavoritesStore.getState();
    expect(s.isInFavorites('p1')).toBe(true);
    expect(s.isInFavorites('yok')).toBe(false);
    expect(s.getFavoriteCount()).toBe(2);
  });
});

describe('J21 · favoriye ekleme (addToFavorites optimistic)', () => {
  beforeEach(() => {
    reset();
    (wishlistApi.get as jest.Mock).mockResolvedValue({ data: { items: [] } });
    (wishlistApi.add as jest.Mock).mockResolvedValue({ data: {} });
  });

  it('aynı ürün iki kez eklenince tek kayıt kalır (idempotent)', async () => {
    // Backend ekleme sonrası fetchFavorites ile senkronize ediyor; backend tek kayıt döndürür.
    (wishlistApi.get as jest.Mock).mockResolvedValue({
      data: { items: [{ id: 'srv-1', productId: 'p1', productTitle: 'Ürün', productPrice: 100 }] },
    });
    const add = useFavoritesStore.getState().addToFavorites;
    await add('p1');
    await add('p1');
    const ids = useFavoritesStore.getState().items.map((i) => i.productId);
    expect(ids.filter((id) => id === 'p1')).toHaveLength(1);
  });

  it('ekleme başarısız olursa optimistic kayıt geri alınır (rollback)', async () => {
    (wishlistApi.add as jest.Mock).mockRejectedValue({ response: { status: 500 } });
    const ok = await useFavoritesStore.getState().addToFavorites('p9');
    expect(ok).toBe(false);
    const s = useFavoritesStore.getState();
    expect(s.isInFavorites('p9')).toBe(false);
    expect(s.error).toBe('Favorilere eklenemedi');
  });
});

describe('J21 · favoriden çıkarma (removeFromFavorites)', () => {
  beforeEach(() => {
    reset();
    (wishlistApi.remove as jest.Mock).mockResolvedValue({ data: {} });
  });

  it('var olan ürünü yerel listeden çıkarır', async () => {
    useFavoritesStore.setState({ items: [makeItem('p1'), makeItem('p2')] });
    const ok = await useFavoritesStore.getState().removeFromFavorites('p1');
    expect(ok).toBe(true);
    const ids = useFavoritesStore.getState().items.map((i) => i.productId);
    expect(ids).toEqual(['p2']);
  });

  it('404 (zaten yok) durumunda bile başarı döner ve listeden çıkarır', async () => {
    (wishlistApi.remove as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    useFavoritesStore.setState({ items: [makeItem('p1')] });
    const ok = await useFavoritesStore.getState().removeFromFavorites('p1');
    expect(ok).toBe(true);
    expect(useFavoritesStore.getState().items).toHaveLength(0);
  });
});

describe('J57 · favorileri temizleme (clearFavorites)', () => {
  beforeEach(() => {
    reset();
    (wishlistApi.clear as jest.Mock).mockResolvedValue({ data: {} });
  });

  it('tüm favorileri siler', async () => {
    useFavoritesStore.setState({ items: [makeItem('p1'), makeItem('p2')] });
    await useFavoritesStore.getState().clearFavorites();
    expect(useFavoritesStore.getState().items).toHaveLength(0);
  });
});
