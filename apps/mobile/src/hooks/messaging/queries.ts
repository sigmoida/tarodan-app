import { useQuery } from '@tanstack/react-query';
import { messagesApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { useAuthStore } from '@/stores/authStore';
import type { Message, MessageThread } from '@/stores/messagesStore';
import { normalizeThread, sortAndNormalizeMessages } from '@/lib/messaging/normalize';

/**
 * #77: messagesStore'un server-state fetch'leri React Query'ye taşındı (CLAUDE.md §8).
 * Reads = query hook (queryKey qk.messaging.*), writes = mutation hook (mutations.ts),
 * socket = setQueryData köprüsü (useMessagingSocket.ts). Store sadece client/UI state.
 */

/** GET /messages/threads — thread listesi (normalize edilmiş katılımcılarla). */
export function useThreadsQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: qk.messaging.threads,
    enabled: isAuthenticated,
    queryFn: async (): Promise<MessageThread[]> => {
      const res = await messagesApi.getThreads();
      const data = res.data?.threads || res.data?.data || res.data || [];
      return (Array.isArray(data) ? data : []).map(normalizeThread);
    },
  });
}

/** GET /messages/unread-count — sayfalamadan bağımsız toplam okunmamış (header/tab rozeti). */
export function useUnreadCountQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: qk.messaging.unreadCount,
    enabled: isAuthenticated,
    queryFn: async (): Promise<number> => {
      const res = await messagesApi.getUnreadCount();
      const c = (res.data as any)?.count;
      return typeof c === 'number' ? c : 0;
    },
  });
}

/** GET /messages/threads/:id — tek thread başlığı (header adı/avatarı). */
export function useThreadQuery(threadId: string | undefined) {
  return useQuery({
    queryKey: qk.messaging.thread(threadId ?? ''),
    enabled: !!threadId,
    queryFn: async (): Promise<MessageThread | null> => {
      const res = await messagesApi.getThread(threadId!);
      const raw = (res.data as any)?.data ?? res.data;
      return raw ? normalizeThread(raw) : null;
    },
  });
}

/** GET /messages/threads/:id/messages — mesajlar (artan sıraya normalize). */
export function useMessagesQuery(threadId: string | undefined) {
  return useQuery({
    queryKey: qk.messaging.messages(threadId ?? ''),
    enabled: !!threadId,
    queryFn: async (): Promise<Message[]> => {
      const res = await messagesApi.getMessages(threadId!, { page: 1, pageSize: 50 });
      const data = res.data?.messages || res.data?.data || res.data || [];
      return sortAndNormalizeMessages(data);
    },
  });
}
