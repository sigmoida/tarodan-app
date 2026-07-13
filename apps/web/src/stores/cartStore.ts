import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hasAuthMarker } from "@/lib/authMarker";
import { cartApi, listingsApi } from "@/lib/api";

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
  maxQuantity?: number;
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

/** Pull a human message off an axios error (message may be a string or array). */
function cartErrorMessage(error: unknown, fallback: string): string {
  const msg = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Apply a fresh backend cart calculation to the store. */
function calcState(data: CartResponse) {
  const calc = data.calculation;
  return {
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

  // Giriş durumu işaretçisi (authStore set eder). Gerçek token DEĞİL; sadece "girişli mi"
  // bilgisi — auth artık httpOnly cookie ile taşınır, sepet çağrıları `/gateway` proxy'sinden geçer.
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
  addToCartLegacy: (
    item: Omit<LegacyCartItem, "id" | "quantity">,
  ) => Promise<void>;

  // Offline fallback (when not logged in)
  offlineItems: LegacyCartItem[];
  addToOfflineCart: (item: Omit<LegacyCartItem, "id" | "quantity">) => void;
  removeFromOfflineCart: (productId: string) => void;
  clearOfflineCart: () => void;
  syncOfflineCart: () => Promise<void>;
}

/** "Am I logged in?" — the store flag if set, else the server-owned marker cookie. */
function isAuthed(authToken: string | null): boolean {
  return !!(authToken ?? (hasAuthMarker() ? "1" : null));
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
        if (token) {
          get()
            .syncOfflineCart()
            .then(() => get().fetchCart());
        }
      },

      fetchCart: async () => {
        if (!isAuthed(get().authToken)) {
          // Use offline cart
          const offlineItems = get().offlineItems;
          const total = offlineItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          );
          const itemCount = offlineItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
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
          const { data } = await cartApi.get();
          set(calcState(data as CartResponse));
        } catch (error) {
          set({
            isLoading: false,
            error: cartErrorMessage(error, "Sepet yüklenirken hata oluştu"),
          });
        }
      },

      addToCart: async (productId, quantity = 1) => {
        const id =
          typeof productId === "string"
            ? productId
            : (productId as any)?.productId;
        if (!id) {
          console.warn("addToCart: productId is required");
          return;
        }

        if (!isAuthed(get().authToken)) {
          set({ isLoading: true, error: null });
          try {
            const { data: product } = await listingsApi.getOne(id);

            get().addToOfflineCart({
              productId: product.id,
              title: product.title,
              price: product.salePrice ?? product.price,
              imageUrl:
                product.images?.[0]?.cardUrl ??
                product.images?.[0]?.detailUrl ??
                product.images?.[0]?.url ??
                product.imageUrl ??
                "",
              seller: {
                id: product.sellerId || product.seller?.id || "",
                displayName:
                  product.sellerName ||
                  product.seller?.displayName ||
                  product.seller?.name ||
                  "Satıcı",
              },
            });
            set({ isLoading: false });
          } catch (error) {
            set({
              isLoading: false,
              error: cartErrorMessage(error, "Ürün bilgisi alınamadı"),
            });
          }
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const { data } = await cartApi.addItem(id, quantity);
          set(calcState(data as CartResponse));
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response
            ?.status;
          const message = cartErrorMessage(
            error,
            `Sepete eklenirken hata oluştu (${status ?? ""})`,
          );
          set({ isLoading: false, error: message });
          throw new Error(message);
        }
      },

      removeFromCart: async (productId) => {
        const id =
          typeof productId === "string"
            ? productId
            : (productId as any)?.productId;
        if (!id) return;

        if (!isAuthed(get().authToken)) {
          const offlineItems = get().offlineItems;
          const newItems = offlineItems.filter((i) => i.productId !== id);
          const total = newItems.reduce(
            (sum, i) => sum + i.price * i.quantity,
            0,
          );
          const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);
          set({
            offlineItems: newItems,
            subtotal: total,
            grandTotal: total + (total >= 500 ? 0 : 29.99),
            itemCount,
            shippingCost: total >= 500 ? 0 : 29.99,
          });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const { data } = await cartApi.removeItem(id);
          set(calcState(data as CartResponse));
        } catch (error) {
          set({
            isLoading: false,
            error: cartErrorMessage(error, "Ürün kaldırılırken hata oluştu"),
          });
        }
      },

      // NOT: updateQuantity, addToCart'ın aksine hatayı YENİDEN FIRLATIR — sepet
      // sayfasındaki stepper backend'in adet/stok reddini toast ile gösterebilsin diye.
      updateQuantity: async (productId, quantity) => {
        if (!isAuthed(get().authToken)) return;

        set({ isLoading: true, error: null });

        try {
          const { data } = await cartApi.updateItem(productId, quantity);
          set(calcState(data as CartResponse));
        } catch (error) {
          const message = cartErrorMessage(
            error,
            "Miktar güncellenirken hata oluştu",
          );
          set({ isLoading: false, error: message });
          throw new Error(message);
        }
      },

      applyCoupon: async (code) => {
        if (!isAuthed(get().authToken)) {
          return { success: false, error: "Giriş yapmanız gerekiyor" };
        }

        set({ isLoading: true, error: null });

        try {
          const { data } = await cartApi.applyCoupon(code);
          set(calcState(data as CartResponse));
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          return {
            success: false,
            error: cartErrorMessage(error, "Kupon uygulanamadı"),
          };
        }
      },

      removeCoupon: async () => {
        if (!isAuthed(get().authToken)) return;

        set({ isLoading: true, error: null });

        try {
          const { data } = await cartApi.removeCoupon();
          set({ ...calcState(data as CartResponse), appliedCouponCode: null });
        } catch (error) {
          set({
            isLoading: false,
            error: cartErrorMessage(error, "Kupon kaldırılırken hata oluştu"),
          });
        }
      },

      clearCart: async () => {
        if (!isAuthed(get().authToken)) {
          set({ offlineItems: [], subtotal: 0, grandTotal: 0, itemCount: 0 });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          await cartApi.clear();

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
            error: cartErrorMessage(error, "Sepet temizlenirken hata oluştu"),
          });
        }
      },

      // Legacy method for backwards compatibility
      addToCartLegacy: async (item) => {
        if (isAuthed(get().authToken)) {
          await get().addToCart(item.productId);
        } else {
          get().addToOfflineCart(item);
        }
      },

      // Offline cart methods
      addToOfflineCart: (item) => {
        const offlineItems = get().offlineItems;
        const existingIndex = offlineItems.findIndex(
          (i) => i.productId === item.productId,
        );

        let newItems: LegacyCartItem[];
        if (existingIndex >= 0) {
          newItems = offlineItems.map((i, idx) =>
            idx === existingIndex ? { ...i, quantity: i.quantity + 1 } : i,
          );
        } else {
          const newItem: LegacyCartItem = {
            ...item,
            id: `cart-${Date.now()}`,
            quantity: 1,
          };
          newItems = [...offlineItems, newItem];
        }

        const total = newItems.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0,
        );
        const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);

        set({
          offlineItems: newItems,
          subtotal: total,
          grandTotal: total + (total >= 500 ? 0 : 29.99),
          itemCount,
          shippingCost: total >= 500 ? 0 : 29.99,
        });
      },

      removeFromOfflineCart: (productId) => {
        const newItems = get().offlineItems.filter(
          (i) => i.productId !== productId,
        );
        const total = newItems.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0,
        );
        const itemCount = newItems.reduce((sum, i) => sum + i.quantity, 0);
        const shipping = newItems.length === 0 ? 0 : total >= 500 ? 0 : 29.99;
        set({
          offlineItems: newItems,
          subtotal: total,
          grandTotal: total + shipping,
          itemCount,
          shippingCost: shipping,
        });
      },

      clearOfflineCart: () => {
        set({
          offlineItems: [],
          subtotal: 0,
          grandTotal: 0,
          itemCount: 0,
          shippingCost: 0,
        });
      },

      syncOfflineCart: async () => {
        const { offlineItems } = get();
        if (!isAuthed(get().authToken) || offlineItems.length === 0) return;

        // Add each offline item to backend cart
        for (const item of offlineItems) {
          try {
            await get().addToCart(item.productId, item.quantity);
          } catch (error) {
            console.error("Failed to sync item:", item.productId, error);
          }
        }

        // Clear offline cart after sync
        set({ offlineItems: [] });
      },
    }),
    {
      name: "cart-storage",
      // authToken'ı KALICI yapma — hassas olmasa da girişli durumu authStore bootstrap'ı belirler.
      // itemCount'u kalıcı yap: sayfa yenilemede fetchCart() tamamlanana kadar
      // rozet "0"/boş görünmesin (son bilinen değer anında gösterilir, sonra senkronlanır).
      partialize: (state) => ({
        offlineItems: state.offlineItems,
        itemCount: state.itemCount,
      }),
    },
  ),
);

// Export for backwards compatibility
export const total = () => useCartStore.getState().grandTotal;
export const itemCount = () => useCartStore.getState().itemCount;

export default useCartStore;
