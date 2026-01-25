import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CartItem {
  id: string;
  productId: string;
  title: string;
  price: number;
  quantity: number;
  imageUrl: string;
  brand?: string;
  scale?: string;
  seller: {
    id: string;
    displayName: string;
  };
  addedAt: number; // timestamp for 24-hour expiry
}

interface CartState {
  items: CartItem[];
  lastUpdated: number;
  isLoading: boolean;
  
  // Actions
  addItem: (item: Omit<CartItem, 'id' | 'quantity' | 'addedAt'>) => void;
  addToCart: (productId: string) => Promise<void>;
  removeItem: (itemId: string) => void;
  removeByProductId: (productId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  cleanExpiredItems: () => void;
  onPurchaseComplete: (productIds: string[]) => void;
  
  // Computed
  getSubtotal: () => number;
  getItemCount: () => number;
}

const CART_EXPIRY_HOURS = 24;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      lastUpdated: Date.now(),
      isLoading: false,

      addItem: (item) => {
        const items = get().items;
        const existingIndex = items.findIndex(i => i.productId === item.productId);

        if (existingIndex >= 0) {
          // Update quantity
          const newItems = [...items];
          newItems[existingIndex].quantity += 1;
          newItems[existingIndex].addedAt = Date.now();
          set({ items: newItems, lastUpdated: Date.now() });
        } else {
          // Add new item
          const newItem: CartItem = {
            ...item,
            id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            quantity: 1,
            addedAt: Date.now(),
          };
          set({ items: [...items, newItem], lastUpdated: Date.now() });
        }
      },

      addToCart: async (productId: string) => {
        set({ isLoading: true });
        try {
          // This would typically fetch product details from API
          // For now, just add with basic info
          const items = get().items;
          const existingIndex = items.findIndex(i => i.productId === productId);

          if (existingIndex >= 0) {
            const newItems = [...items];
            newItems[existingIndex].quantity += 1;
            newItems[existingIndex].addedAt = Date.now();
            set({ items: newItems, lastUpdated: Date.now(), isLoading: false });
          } else {
            // In real app, fetch product details here
            set({ isLoading: false });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      removeItem: (itemId) => {
        const items = get().items.filter(i => i.id !== itemId);
        set({ items, lastUpdated: Date.now() });
      },

      removeByProductId: (productId: string) => {
        const items = get().items.filter(i => i.productId !== productId);
        set({ items, lastUpdated: Date.now() });
      },

      updateQuantity: (itemId, quantity) => {
        if (quantity < 1) {
          get().removeItem(itemId);
          return;
        }
        const items = get().items.map(i =>
          i.id === itemId ? { ...i, quantity, addedAt: Date.now() } : i
        );
        set({ items, lastUpdated: Date.now() });
      },

      clearCart: () => {
        set({ items: [], lastUpdated: Date.now() });
      },

      cleanExpiredItems: () => {
        const now = Date.now();
        const expiryMs = CART_EXPIRY_HOURS * 60 * 60 * 1000;
        const items = get().items.filter(item => {
          return (now - item.addedAt) < expiryMs;
        });
        
        if (items.length !== get().items.length) {
          set({ items, lastUpdated: Date.now() });
        }
      },

      // Remove purchased items from cart
      onPurchaseComplete: (productIds: string[]) => {
        const items = get().items.filter(item => !productIds.includes(item.productId));
        set({ items, lastUpdated: Date.now() });
      },

      getSubtotal: () => {
        return get().items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'tarodan-cart',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useCartStore;
