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
  /** Optimistic badge hint (last shown item count). Written by `useCart`. */
  itemCount: number;
  setItemCount: (count: number) => void;

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
      itemCount: 0,

      setItemCount: (count) => set({ itemCount: count }),

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

      clearOfflineCart: () => set({ offlineItems: [] }),
    }),
    {
      name: "cart-storage",
      // Persist the guest cart (so it survives reloads) and the badge hint (so
      // the header count doesn't flash to 0 before the authed query resolves).
      partialize: (state) => ({
        offlineItems: state.offlineItems,
        itemCount: state.itemCount,
      }),
    },
  ),
);

export default useCartStore;
