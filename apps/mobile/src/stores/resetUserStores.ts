import { queryClient } from '../lib/queryClient';
import { useCartStore } from './cartStore';
import { useMessagesStore } from './messagesStore';

/**
 * Çıkışta kullanıcıya özel tüm yerel state'i sıfırlar; yoksa rozetler
 * (favori/sepet/mesaj/bildirim sayıları) ve sepet içeriği önceki oturumdan
 * kalmış gibi görünmeye devam eder.
 *
 * Dikkat: favoriler için clearFavorites() ÇAĞRILMAZ — o DELETE /wishlist ile
 * sunucudaki listeyi de siler. Favori listesi artık React Query cache'inde;
 * aşağıdaki queryClient.clear() onu da (yerel olarak) temizler.
 */
export function resetUserStores(): void {
  // Sepet: persist'li store — clearCart AsyncStorage'a da boş yazar.
  useCartStore.getState().clearCart();
  useCartStore.getState().clearBuyNow();

  useMessagesStore.setState({
    threads: [],
    currentThread: null,
    currentThreadId: null,
    messages: [],
    isLoading: false,
    hasLoadedThreads: false,
    isLoadingMessages: false,
    error: null,
    dailyMessageCount: 0,
    totalUnreadCount: 0,
  });

  // Bildirim rozeti dahil tüm react-query önbelleği (örn. 'notifications-unread').
  queryClient.clear();
}
