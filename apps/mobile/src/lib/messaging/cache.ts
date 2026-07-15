import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';
import { mergeMessages } from './normalize';
import type { Message, MessageThread } from '@/stores/messagesStore';

/**
 * #77 cache köprüsü — hem mutation'lar (send/create) hem socket dinleyicileri
 * aynı optimistik mantığı kullanır. Eski store'un applyIncomingMessage /
 * markAsRead / applyMessagesRead davranışı burada setQueryData ile birebir.
 */

/**
 * Gelen ya da gönderilen mesajı cache'e uygula:
 *  - açık thread ise mesaj listesine id-dedupe + sort + cap ile ekle,
 *  - thread'in lastMessage/updatedAt'ini güncelle,
 *  - karşı taraftan gelip thread KAPALIysa okunmamış sayaçlarını canlı artır.
 * (Kendi gönderdiğin mesaj: fromOther=false → bump YOK, sadece liste + lastMessage.)
 */
export function applyIncomingToCache(
  qc: QueryClient,
  threadId: string,
  message: Message,
  opts: { isOpen: boolean; myUserId?: string },
): void {
  const { isOpen, myUserId } = opts;

  if (isOpen) {
    qc.setQueryData<Message[]>(qk.messaging.messages(threadId), (old) =>
      mergeMessages(old, message),
    );
  }

  const fromOther = !!message?.senderId && message.senderId !== myUserId;
  const bumpUnread = !isOpen && fromOther;

  qc.setQueryData<MessageThread[]>(qk.messaging.threads, (old) =>
    (old ?? []).map((t) =>
      t.id === threadId
        ? {
            ...t,
            lastMessage: {
              content: message.content,
              senderId: message.senderId,
              createdAt: message.createdAt,
            },
            updatedAt: message.createdAt,
            unreadCount: bumpUnread ? (t.unreadCount || 0) + 1 : t.unreadCount,
          }
        : t,
    ),
  );

  if (bumpUnread) {
    qc.setQueryData<number>(qk.messaging.unreadCount, (c) => (c ?? 0) + 1);
  }
}

/**
 * Thread açıldı → okunmamış optimistik sıfırla. ⚠️ Bilerek invalidate ETMEZ:
 * markAsRead sunucuda getThreadMessages ile işleniyor; hemen unread-count çekmek
 * o işlem bitmeden stale değeri geri yazıp rozeti 1'e döndürüyordu.
 */
export function applyThreadReadToCache(qc: QueryClient, threadId: string): void {
  let prevUnread = 0;
  qc.setQueryData<MessageThread[]>(qk.messaging.threads, (old) =>
    (old ?? []).map((t) => {
      if (t.id === threadId) {
        prevUnread = t.unreadCount || 0;
        return { ...t, unreadCount: 0 };
      }
      return t;
    }),
  );
  qc.setQueryData<number>(qk.messaging.unreadCount, (c) => Math.max(0, (c ?? 0) - prevUnread));
}

/**
 * Karşı taraf mesajlarımı okudu (socket message:read) → verilen id'leri 'read'
 * yap; gönderen tarafta çift mavi çentik canlı döner.
 */
export function applyMessagesReadToCache(
  qc: QueryClient,
  threadId: string,
  messageIds: string[],
): void {
  const ids = new Set(messageIds);
  qc.setQueryData<Message[]>(qk.messaging.messages(threadId), (old) =>
    (old ?? []).map((m) =>
      m.threadId === threadId && ids.has(m.id)
        ? { ...m, status: 'read' as const, readAt: new Date().toISOString() }
        : m,
    ),
  );
}

/** findOrCreate dönen thread'i listeye dedupe ile başa ekle (createThread). */
export function prependThreadToCache(qc: QueryClient, thread: MessageThread): void {
  qc.setQueryData<MessageThread[]>(qk.messaging.threads, (old) => [
    thread,
    ...(old ?? []).filter((t) => t.id !== thread.id),
  ]);
}
