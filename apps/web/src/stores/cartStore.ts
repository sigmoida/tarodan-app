import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Cart item from backend API
interface CartItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  sellerId: string;
  sellerName: string;
  quantity: number;
  originalPrice: number;
  salePrice?: number;
  effectivePrice: number;
  lineTotal: number;
  productDiscount?: number;
  isAvailable: boolean;
  stockWarning?: string;
}

// Applied discount info
interface AppliedDiscount {
  discountId: string;
  discountName: string;
  discountCode?: string;
  type: string;
  value: number;
  scope: string;
  appliedAmount: number;
  affectedProductIds?: string[];
}

// Full cart calculation from backend
interface CartCalculation {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  productDiscountTotal: number;
  couponDiscountTotal: number;
  campaignDiscountTotal: number;
  totalDiscount: number;
  shippingCost: number;
  amountToFreeShipping: number;
  grandTotal: number;
  appliedCouponCode?: string;
  appliedDiscounts: AppliedDiscount[];
  warnings: string[];
}

// Backend cart response
interface CartResponse {
  id: string;
  userId: string;
  couponCode?: string;
  expiresAt: string;
  calculation: CartCalculation;
}

// Legacy interface for backwards compatibility
interface LegacyCartItem {
  id: string;
  productId: string;
  title: string;
  price: number;
  quantity: number;
  imageUrl: string;
  seller: {
    id: string;
    displayName: string;
  };
}

interface CartState {
  // Main cart data
  cart: CartResponse | null;
  items: CartItem[];
  
  // Calculated totals
  subtotal: number;
  totalDiscount: number;
  shippingCost: number;
  grandTotal: number;
  itemCount: number;
  
  // Coupon state
  appliedCouponCode: string | null;
  appliedDiscounts: AppliedDiscount[];
  
  // UI states
  isLoading: boolean;
  error: string | null;
  warnings: string[];
  
  // Auth token (set by auth store)
  authToken: string | null;
  setAuthToken: (token: string | null) => void;
  
  // API methods
  fetchCart: () => Promise<void>;
  addToCart: (productId: string, quantity?: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  applyCoupon: (code: string) => Promise<{ success: boolean; error?: string }>;
  removeCoupon: () => Promise<void>;
  clearCart: () => Promise<void>;
  
  // Legacy method for backwards compatibility
  addToCartLegacy: (item: Omit<LegacyCartItem, 'id' | 'quantity'>) => Promise<void>;
  
  // Offline fallback (when not logged in)
  offlineItems: LegacyCartItem[];
  addToOfflineCart: (item: Omit<LegacyCartItem, 'id' | 'quantity'>) => void;
  clearOfflineCart: () => void;
  syncOfflineCart: () => Promise<void>;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cart: null,
      items: [],
      subtotal: 0,
      totalDiscount: 0,
      shippingCost: 0,
      grandTotal: 0,
      itemCount: 0,
      appliedCouponCode: null,
      appliedDiscounts: [],
      isLoading: false,
      error: null,
      warnings: [],
      authToken: null,
      offlineItems: [],
      
      setAuthToken: (token) => {
        set({ authToken: token });
        // Fetch cart when token is set
        if (token) {
          get().fetchCart();
        }
      },
      
      fetchCart: async () => {
        const token = get().authToken ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!token) {
          // Use offline cart
          const offlineItems = get().offlineItems;
          const total = offlineItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          const itemCount = offlineItems.reduce((sum, item) => sum + item.quantity, 0);
          set({ 
            subtotal: total, 
            grandTotal: total, 
            itemCount,
            shippingCost: total >= 500 ? 0 : 29.99,
          });
          return;
        }
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/cart`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (!response.ok) {
            throw new Error('Sepet yüklenirken hata oluştu');
          }
          
          const data: CartResponse = await response.json();
          const calc = data.calculation;
          
          set({
            cart: data,
            items: calc.items,
            subtotal: calc.subtotal,
            totalDiscount: calc.totalDiscount,
            shippingCost: calc.shippingCost,
            grandTotal: calc.grandTotal,
            itemCount: calc.itemCount,
            appliedCouponCode: calc.appliedCouponCode || null,
            appliedDiscounts: calc.appliedDiscounts,
            warnings: calc.warnings,
            isLoading: false,
          });
        } catch (error) {
          set({ 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Hata oluştu',
          });
        }
      },
      
      addToCart: async (productId, quantity = 1) => {
        // productId must be a string (backend expects it)
        const id = typeof productId === 'string' ? productId : (productId as any)?.productId;
        if (!id) {
          console.warn('addToCart: productId is required');
          return;
        }
        const token = get().authToken ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!token) {
          console.warn('Cannot add to cart without authentication');
          return;
        }
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/cart/items`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productId: id, quantity }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Sepete eklenirken hata oluştu');
          }
          
          const data: CartResponse = await response.json();
          const calc = data.calculation;
          
          set({
            cart: data,
            items: calc.items,
            subtotal: calc.subtotal,
            totalDiscount: calc.totalDiscount,
            shippingCost: calc.shippingCost,
            grandTotal: calc.grandTotal,
            itemCount: calc.itemCount,
            appliedCouponCode: calc.appliedCouponCode || null,
            appliedDiscounts: calc.appliedDiscounts,
            warnings: calc.warnings,
            isLoading: false,
          });
        } catch (error) {
          set({ 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Hata oluştu',
          });
          throw error;
        }
      },
      
      removeFromCart: async (productId) => {
        const token = get().authToken ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!token) return;
        
        const id = typeof productId === 'string' ? productId : (productId as any)?.productId;
        if (!id) return;
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/cart/items/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            throw new Error('Ürün kaldırılırken hata oluştu');
          }
          
          const data: CartResponse = await response.json();
          const calc = data.calculation;
          
          set({
            cart: data,
            items: calc.items,
            subtotal: calc.subtotal,
            totalDiscount: calc.totalDiscount,
            shippingCost: calc.shippingCost,
            grandTotal: calc.grandTotal,
            itemCount: calc.itemCount,
            appliedCouponCode: calc.appliedCouponCode || null,
            appliedDiscounts: calc.appliedDiscounts,
            warnings: calc.warnings,
            isLoading: false,
          });
        } catch (error) {
          set({ 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Hata oluştu',
          });
        }
      },
      
      updateQuantity: async (productId, quantity) => {
        const token = get().authToken ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!token) return;
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/cart/items/${productId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ quantity }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Miktar güncellenirken hata oluştu');
          }
          
          const data: CartResponse = await response.json();
          const calc = data.calculation;
          
          set({
            cart: data,
            items: calc.items,
            subtotal: calc.subtotal,
            totalDiscount: calc.totalDiscount,
            shippingCost: calc.shippingCost,
            grandTotal: calc.grandTotal,
            itemCount: calc.itemCount,
            appliedCouponCode: calc.appliedCouponCode || null,
            appliedDiscounts: calc.appliedDiscounts,
            warnings: calc.warnings,
            isLoading: false,
          });
        } catch (error) {
          set({ 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Hata oluştu',
          });
        }
      },
      
      applyCoupon: async (code) => {
        const token = get().authToken ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!token) {
          return { success: false, error: 'Giriş yapmanız gerekiyor' };
        }
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/cart/coupon`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            set({ isLoading: false });
            return { success: false, error: errorData.message || 'Kupon uygulanamadı' };
          }
          
          const data: CartResponse = await response.json();
          const calc = data.calculation;
          
          set({
            cart: data,
            items: calc.items,
            subtotal: calc.subtotal,
            totalDiscount: calc.totalDiscount,
            shippingCost: calc.shippingCost,
            grandTotal: calc.grandTotal,
            itemCount: calc.itemCount,
            appliedCouponCode: calc.appliedCouponCode || null,
            appliedDiscounts: calc.appliedDiscounts,
            warnings: calc.warnings,
            isLoading: false,
          });
          
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Hata oluştu',
          };
        }
      },
      
      removeCoupon: async () => {
        const { authToken } = get();
        if (!authToken) return;
        
        set({ isLoading: true, error: null });
        
        try {
          const response = await fetch(`${API_URL}/api/cart/coupon`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });
          
          if (!response.ok) {
            throw new Error('Kupon kaldırılırken hata oluştu');
          }
          
          const data: CartResponse = await response.json();
          const calc = data.calculation;
          
          set({
            cart: data,
            items: calc.items,
            subtotal: calc.subtotal,
            totalDiscount: calc.totalDiscount,
            shippingCost: calc.shippingCost,
            grandTotal: calc.grandTotal,
            itemCount: calc.itemCount,
            appliedCouponCode: null,
            appliedDiscounts: calc.appliedDiscounts,
            warnings: calc.warnings,
            isLoading: false,
          });
        } catch (error) {
          set({ 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Hata oluştu',
          });
        }
      },
      
      clearCart: async () => {
        const token = get().authToken ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        if (!token) {
          set({ offlineItems: [], subtotal: 0, grandTotal: 0, itemCount: 0 });
          return;
        }
        
        set({ isLoading: true, error: null });
        
        try {
          await fetch(`${API_URL}/api/cart`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          set({
            cart: null,
            items: [],
            subtotal: 0,
            totalDiscount: 0,
            shippingCost: 0,
            grandTotal: 0,
            itemCount: 0,
            appliedCouponCode: null,
            appliedDiscounts: [],
            warnings: [],
            isLoading: false,
          });
        } catch (error) {
          set({ 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Hata oluştu',
          });
        }
      },
      
      // Legacy method for backwards compatibility
      addToCartLegacy: async (item) => {
        const { authToken } = get();
        if (authToken) {
          await get().addToCart(item.productId);
        } else {
          get().addToOfflineCart(item);
        }
      },
      
      // Offline cart methods
      addToOfflineCart: (item) => {
        const offlineItems = get().offlineItems;
        const existingIndex = offlineItems.findIndex(i => i.productId === item.productId);
        
        let newItems: LegacyCartItem[];
        if (existingIndex >= 0) {
          newItems = offlineItems.map((i, idx) => 
            idx === existingIndex ? { ...i, quantity: i.quantity + 1 } : i
          );
        } else {
          const newItem: LegacyCartItem = {
            ...item,
            id: `cart-${Date.now()}`,
            quantity: 1,
          };
          newItems = [...offlineItems, newItem];
        }
        
        const total = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);
        
        set({ 
          offlineItems: newItems, 
          subtotal: total, 
          grandTotal: total + (total >= 500 ? 0 : 29.99),
          itemCount,
          shippingCost: total >= 500 ? 0 : 29.99,
        });
      },
      
      clearOfflineCart: () => {
        set({ offlineItems: [], subtotal: 0, grandTotal: 0, itemCount: 0, shippingCost: 0 });
      },
      
      syncOfflineCart: async () => {
        const token = get().authToken ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
        const { offlineItems } = get();
        if (!token || offlineItems.length === 0) return;
        
        // Add each offline item to backend cart
        for (const item of offlineItems) {
          try {
            await get().addToCart(item.productId, item.quantity);
          } catch (error) {
            console.error('Failed to sync item:', item.productId, error);
          }
        }
        
        // Clear offline cart after sync
        set({ offlineItems: [] });
      },
    }),
    {
      name: 'cart-storage',
      partialize: (state) => ({
        offlineItems: state.offlineItems,
        authToken: state.authToken,
      }),
    }
  )
);

// Export for backwards compatibility
export const total = () => useCartStore.getState().grandTotal;
export const itemCount = () => useCartStore.getState().itemCount;

export default useCartStore;
