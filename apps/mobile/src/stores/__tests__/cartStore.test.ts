/**
 * J33 · sepet stok/adet kuralları, J1 · sepet özeti (ara toplam/adet),
 * J58/J59 · sepete ekle/çıkar, J60/J61 · sepet temizleme/güncelleme.
 * cartStore SAF zustand birim testi (getState).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { useCartStore } from '../cartStore';

const baseItem = {
  productId: 'p1',
  title: 'Hot Wheels Mustang',
  price: 100,
  imageUrl: 'http://x/img.png',
  seller: { id: 's1', displayName: 'Satıcı' },
};

const reset = () => useCartStore.setState({ items: [], lastUpdated: Date.now(), isLoading: false });

describe('J58 · sepete ekle (addItem)', () => {
  beforeEach(reset);

  it('yeni ürün quantity=1 ile eklenir ve isInCart true döner', () => {
    useCartStore.getState().addItem(baseItem);
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.quantity).toBe(1);
    expect(s.isInCart('p1')).toBe(true);
    expect(s.isInCart('yok')).toBe(false);
  });

  it('aynı ürün tekrar eklenince yeni satır değil quantity artar', () => {
    const add = useCartStore.getState().addItem;
    add(baseItem);
    add(baseItem);
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.quantity).toBe(2);
  });
});

describe('J1 · sepet özeti (getSubtotal / getItemCount)', () => {
  beforeEach(reset);

  it('ara toplam = price*quantity toplamı, adet = quantity toplamı', () => {
    const st = useCartStore.getState();
    st.addItem(baseItem); // p1 x1 @100
    st.addItem({ ...baseItem, productId: 'p2', price: 50 }); // p2 x1 @50
    st.addItem(baseItem); // p1 -> x2
    const s = useCartStore.getState();
    expect(s.getItemCount()).toBe(3);
    expect(s.getSubtotal()).toBe(100 * 2 + 50);
  });

  it('boş sepette ara toplam ve adet 0', () => {
    const s = useCartStore.getState();
    expect(s.getSubtotal()).toBe(0);
    expect(s.getItemCount()).toBe(0);
  });
});

describe('J33 · adet güncelleme (updateQuantity)', () => {
  beforeEach(reset);

  it('quantity geçerli değere set edilir', () => {
    useCartStore.getState().addItem(baseItem);
    const id = useCartStore.getState().items[0]!.id;
    useCartStore.getState().updateQuantity(id, 5);
    expect(useCartStore.getState().items[0]!.quantity).toBe(5);
  });

  it('quantity<1 olunca ürün sepetten çıkarılır', () => {
    useCartStore.getState().addItem(baseItem);
    const id = useCartStore.getState().items[0]!.id;
    useCartStore.getState().updateQuantity(id, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe('J33b · stok / sipariş-limiti tavanı', () => {
  beforeEach(reset);

  it('updateQuantity stok adedini aşamaz (stok=3 → 5 istenirse 3)', () => {
    useCartStore.getState().addItem({ ...baseItem, stock: 3 });
    const id = useCartStore.getState().items[0]!.id;
    useCartStore.getState().updateQuantity(id, 5);
    expect(useCartStore.getState().items[0]!.quantity).toBe(3);
  });

  it('updateQuantity maxQuantityPerOrder sınırını aşamaz', () => {
    useCartStore.getState().addItem({ ...baseItem, stock: 50, maxQuantityPerOrder: 2 });
    const id = useCartStore.getState().items[0]!.id;
    useCartStore.getState().updateQuantity(id, 9);
    expect(useCartStore.getState().items[0]!.quantity).toBe(2);
  });

  it('stok bilgisi yoksa API tavanı 99 uygulanır', () => {
    useCartStore.getState().addItem(baseItem); // stok yok
    const id = useCartStore.getState().items[0]!.id;
    useCartStore.getState().updateQuantity(id, 250);
    expect(useCartStore.getState().items[0]!.quantity).toBe(99);
  });

  it('addItem tekrar ekleme stok tavanında durur (stok=2)', () => {
    const add = useCartStore.getState().addItem;
    add({ ...baseItem, stock: 2 });
    add({ ...baseItem, stock: 2 });
    add({ ...baseItem, stock: 2 }); // 3. kez — 2 de kalmalı
    expect(useCartStore.getState().items[0]!.quantity).toBe(2);
  });
});

describe('J59 · sepetten çıkar (removeItem / removeByProductId)', () => {
  beforeEach(reset);

  it('removeItem id ile siler', () => {
    useCartStore.getState().addItem(baseItem);
    const id = useCartStore.getState().items[0]!.id;
    useCartStore.getState().removeItem(id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('removeByProductId productId ile siler', () => {
    useCartStore.getState().addItem(baseItem);
    useCartStore.getState().addItem({ ...baseItem, productId: 'p2' });
    useCartStore.getState().removeByProductId('p1');
    const s = useCartStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.productId).toBe('p2');
  });
});

describe('J60 · sepet temizleme (clearCart / onPurchaseComplete)', () => {
  beforeEach(reset);

  it('clearCart tüm ürünleri siler', () => {
    useCartStore.getState().addItem(baseItem);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('onPurchaseComplete satın alınan productId leri çıkarır', () => {
    useCartStore.getState().addItem(baseItem);
    useCartStore.getState().addItem({ ...baseItem, productId: 'p2' });
    useCartStore.getState().onPurchaseComplete(['p1']);
    const s = useCartStore.getState();
    expect(s.items.map(i => i.productId)).toEqual(['p2']);
  });
});

describe('J61 · süresi dolan ürünler (cleanExpiredItems)', () => {
  beforeEach(reset);

  it('24 saatten eski ürün temizlenir, yeni ürün kalır', () => {
    const old = 25 * 60 * 60 * 1000;
    useCartStore.setState({
      items: [
        { ...baseItem, id: 'a', quantity: 1, addedAt: Date.now() - old },
        { ...baseItem, productId: 'p2', id: 'b', quantity: 1, addedAt: Date.now() },
      ],
    });
    useCartStore.getState().cleanExpiredItems();
    const s = useCartStore.getState();
    expect(s.items.map(i => i.id)).toEqual(['b']);
  });
});
