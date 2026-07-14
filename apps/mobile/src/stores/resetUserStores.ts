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

  // #77: mesaj server-state'i artık React Query'de (qk.messaging.*) — queryClient.clear()
  // aşağıda onu da temizler. Store yalnız client state tutar (aktif thread + günlük sayaç).
  useMessagesStore.setState({
    currentThreadId: null,
    dailyMessageCount: 0,
  });

  // Bildirim + mesaj rozeti dahil tüm react-query önbelleği (örn. 'notifications-unread').
  queryClient.clear();
}
