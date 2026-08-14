import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OfflineCartItem } from "@/lib/api";

/**
 * Client-only cart state. This is NOT the cart — the authenticated cart lives in
 * TanStack Query (`['cart']`, read/written through `useCart`). This store holds
 * only what is genuinely client state (CLAUDE.md §8):
 *
 *  - `offlineItems`: the guest cart, kept in localStorage until the user logs in.
 *  - `itemCount`: an optimistic hint so the header badge shows the last known
 *    count instantly on reload, before the authed cart query resolves. `useCart`
 *    keeps it in sync; nothing else should write it.
 *
 * All server reads/writes and the guest↔authed derivation moved to `useCart`.
 */
interface CartStoreState {
  offlineItems: OfflineCartItem[];
  /**
   * Guest cart coupon — only the CODE is stored; the discount amount is derived
   * reactively in `useCart` (server re-validates against current items), so a
   * quantity change never leaves a stale amount. Cleared on login-merge & clear.
   */
  offlineCouponCode: string | null;
  setOfflineCouponCode: (code: string | null) => void;
  /** Optimistic badge hint (last shown item count). Written by `useCart`. */
  itemCount: number;
  setItemCount: (count: number) => void;

  /**
   * Ödemeye taşınmayacak satırlar. Seçilenler DEĞİL, seçim DIŞI bırakılanlar
   * tutulur: sepete yeni eklenen ürün hiçbir yeri güncellemeden seçili gelir
   * (kullanıcının beklentisi bu), sadece bilerek çıkardıkları hatırlanır.
   */
  excludedProductIds: string[];
  toggleProductSelected: (productId: string) => void;
  /** Toplu seç/kaldır (ör. "tümünü seç" kutusu). */
  setProductsSelected: (productIds: string[], selected: boolean) => void;
  /**
   * Sepette artık bulunmayan kimliklerin dışlamasını düşürür.
   *
   * Liste kalıcı olduğu için budanmadan büyüyordu: kullanıcı bir ürünün
   * seçimini kaldırıp ardından onu sepetten çıkarınca kimlik listede kalıyor,
   * AYNI ürün sonra tekrar eklendiğinde seçilmemiş geliyordu — yani yukarıdaki
   * "yeni eklenen ürün seçili gelir" kuralının tam tersi.
   */
  pruneExcludedProductIds: (presentProductIds: string[]) => void;
  /**
   * "Hemen Al" kapsamı. Kalıcı seçimi BOZMADAN tek ürünle ödemeye geçmeyi
   * sağlar: kullanıcı vazgeçip sepete dönerse eski seçimi olduğu gibi durur.
   * Kalıcıdır — ödeme sayfası yenilendiğinde kapsam kaybolup sepetin tamamı
   * tahsil edilmemeli.
   */
  buyNowProductId: string | null;
  setBuyNowProductId: (productId: string | null) => void;

  addToOfflineCart: (item: Omit<OfflineCartItem, "id" | "quantity">) => void;
  /** Misafir sepetinde bir satırın adedini stok tavanına kırparak ayarlar (stepper). */
  updateOfflineQuantity: (productId: string, quantity: number) => void;
  removeFromOfflineCart: (productId: string) => void;
  clearOfflineCart: () => void;
}

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      offlineItems: [],
      offlineCouponCode: null,
      itemCount: 0,
      excludedProductIds: [],
      buyNowProductId: null,

      setOfflineCouponCode: (code) => set({ offlineCouponCode: code }),
      setItemCount: (count) => set({ itemCount: count }),

      toggleProductSelected: (productId) => {
        const excluded = get().excludedProductIds;
        set({
          excludedProductIds: excluded.includes(productId)
            ? excluded.filter((id) => id !== productId)
            : [...excluded, productId],
        });
      },

      setProductsSelected: (productIds, selected) => {
        const excluded = get().excludedProductIds;
        set({
          excludedProductIds: selected
            ? excluded.filter((id) => !productIds.includes(id))
            : [...new Set([...excluded, ...productIds])],
        });
      },

      pruneExcludedProductIds: (presentProductIds) => {
        const excluded = get().excludedProductIds;
        const present = new Set(presentProductIds);
        const next = excluded.filter((id) => present.has(id));
        // Uzunluk aynıysa yeni dizi YAZILMAZ: her yazma store'a abone her
        // bileşeni yeniden render eder ve bu, sepet her yüklendiğinde çağrılır.
        if (next.length !== excluded.length) set({ excludedProductIds: next });
      },

      setBuyNowProductId: (productId) => set({ buyNowProductId: productId }),

      addToOfflineCart: (item) => {
        const offlineItems = get().offlineItems;
        const existingIndex = offlineItems.findIndex(
          (i) => i.productId === item.productId,
        );
        if (existingIndex >= 0) {
          set({
            offlineItems: offlineItems.map((i, idx) => {
              if (idx !== existingIndex) return i;
              // En güncel stok bilgisini koru; adedi stok tavanına kırp.
              const stock = item.stock ?? i.stock;
              const nextQty =
                stock != null
                  ? Math.min(i.quantity + 1, stock)
                  : i.quantity + 1;
              return { ...i, stock, quantity: nextQty };
            }),
          });
        } else {
          set({
            offlineItems: [
              ...offlineItems,
              { ...item, id: `cart-${Date.now()}`, quantity: 1 },
            ],
          });
        }
      },

      updateOfflineQuantity: (productId, quantity) => {
        set({
          offlineItems: get().offlineItems.map((i) => {
            if (i.productId !== productId) return i;
            // [1, stok] aralığına kırp (stok bilinmiyorsa yalnız alt sınır).
            const capped =
              i.stock != null ? Math.min(quantity, i.stock) : quantity;
            return { ...i, quantity: Math.max(1, capped) };
          }),
        });
      },

      removeFromOfflineCart: (productId) => {
        set({
          offlineItems: get().offlineItems.filter(
            (i) => i.productId !== productId,
          ),
        });
      },

      clearOfflineCart: () =>
        set({
          offlineItems: [],
          offlineCouponCode: null,
          excludedProductIds: [],
          buyNowProductId: null,
        }),
    }),
    {
      name: "cart-storage",
      // Persist the guest cart (so it survives reloads) and the badge hint (so
      // the header count doesn't flash to 0 before the authed query resolves).
      partialize: (state) => ({
        offlineItems: state.offlineItems,
        offlineCouponCode: state.offlineCouponCode,
        itemCount: state.itemCount,
        excludedProductIds: state.excludedProductIds,
        buyNowProductId: state.buyNowProductId,
      }),
    },
  ),
);

export default useCartStore;
