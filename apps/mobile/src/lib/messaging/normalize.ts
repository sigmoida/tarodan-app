import type { Message, MessageThread } from '@/stores/messagesStore';

/** Canlı mesaj dizisini sınırla (#76) — uzun ömürlü thread sınırsız büyümesin. */
export const MAX_THREAD_MESSAGES = 200;

/**
 * API mesajı normalize: backend `readAt` dolu döndürdüğünde (karşı taraf okudu)
 * görüntü durumu 'read' olur. Tik mantığı `status` üzerinden sürüldüğü için
 * okundu çift mavi çentik bu sayede ilk yüklemede de doğru görünür.
 */
export function normalizeMessage(m: any): Message {
  if (m && m.readAt && m.status !== 'pending_approval' && m.status !== 'rejected') {
    return { ...m, status: 'read' };
  }
  return m;
}

/**
 * API thread'leri düz alanlarla döndürür (participant1Id/Name/AvatarUrl,
 * participant2...). Mobil getOtherParticipant nested participant1/participant2
 * objesi beklediği için burada düz alanları nesneye normalize ediyoruz — yoksa
 * isim 'Kullanıcı' görünür. Hem threads hem thread query'si bu helper'ı kullanır.
 */
export function normalizeThread(t: any): MessageThread {
  if (!t || typeof t !== 'object') return t;
  const participant1 =
    t.participant1 && typeof t.participant1 === 'object'
      ? t.participant1
      : {
          id: t.participant1Id || t.sender?.id || '',
          displayName: t.participant1Name || t.sender?.displayName || 'Kullanıcı',
          avatarUrl: t.participant1AvatarUrl || t.sender?.avatarUrl || undefined,
        };
  const participant2 =
    t.participant2 && typeof t.participant2 === 'object'
      ? t.participant2
      : {
          id: t.participant2Id || t.otherUser?.id || t.receiver?.id || '',
          displayName:
            t.participant2Name || t.otherUser?.displayName || t.receiver?.displayName || 'Kullanıcı',
          avatarUrl:
            t.participant2AvatarUrl || t.otherUser?.avatarUrl || t.receiver?.avatarUrl || undefined,
        };
  return {
    ...t,
    participant1Id: t.participant1Id || participant1.id,
    participant2Id: t.participant2Id || participant2.id,
    participant1,
    participant2,
    unreadCount: t.unreadCount || 0,
  };
}

/**
 * Sohbet ekranı en eski üstte / en yeni altta ister; API createdAt desc döndürür.
 * Artan sıraya çevir + normalize et. (Eski store fetchMessages ile aynı.)
 */
export function sortAndNormalizeMessages(raw: any): Message[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(normalizeMessage);
}

/**
 * Gelen socket mesajını mevcut listeye id-dedupe + createdAt sort + cap ile birleştir.
 * (Eski store applyIncomingMessage'ın liste mantığı — web messageMerge karşılığı.)
 */
export function mergeMessages(old: Message[] | undefined, incoming: Message): Message[] {
  const list = old ?? [];
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-MAX_THREAD_MESSAGES);
}
