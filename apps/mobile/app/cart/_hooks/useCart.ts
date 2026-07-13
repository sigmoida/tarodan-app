import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/services/api';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * Cart controller — owns the cart store bindings, the expired-item cleanup, the
 * buyer-fee quote query, and the totals + quantity/remove handlers. Lifted
 * verbatim from the monolithic screen (§12).
 */
export function useCart() {
  const { items, getSubtotal, getItemCount, removeItem, updateQuantity, cleanExpiredItems } = useCartStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Clean expired items on mount
  useEffect(() => {
    cleanExpiredItems();
  }, []);

  const subtotal = getSubtotal();
  const itemCount = getItemCount();

  // Platform hizmet bedeli (komisyon) — backend quote'tan, sepette de net göster.
  const quoteQuery = useQuery({
    queryKey: ['cart-quote', items.map((it) => `${it.productId}:${it.quantity}`).join(',')],
    queryFn: async () => {
      const res: any = await ordersApi.getQuote({
        items: items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
      });
      return (res.data?.pricing ?? res.data ?? {}) as { buyerFeeAmount?: number };
    },
    enabled: items.length > 0,
    staleTime: 60_000,
  });
  const buyerFee = Number(quoteQuery.data?.buyerFeeAmount ?? 0);
  const total = subtotal + buyerFee;

  const handleRemove = (itemId: string) => {
    removeItem(itemId);
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      updateQuantity(itemId, item.quantity + delta);
    }
  };

  return {
    items,
    isAuthenticated,
    subtotal,
    itemCount,
    buyerFee,
    total,
    handleRemove,
    handleQuantityChange,
  };
}

export type CartController = ReturnType<typeof useCart>;
