import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '@/services/socket';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import { qk } from '@/lib/query';
import {
  applyIncomingToCache,
  applyMessagesReadToCache,
} from '@/lib/messaging/cache';

/**
 * #77: global mesaj socket dinleyicileri — eski _layout store-action'ları yerine
 * React Query cache köprüsü. Oturum açıkken bağlanır, kapanınca kopar.
 *
 * Aktif thread ayrımı `messagesStore.currentThreadId`'den okunur (o hâlâ client/UI
 * state olarak kalıyor); açık thread'e gelen mesaj listeye eklenir, kapalı thread
 * için okunmamış sayaçları artar.
 */
export function useMessagingSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }
    const socket = connectSocket(token);

    const onMessageNew = (p: { threadId: string; message: any }) => {
      const myUserId = useAuthStore.getState().user?.id;
      const isOpen = useMessagesStore.getState().currentThreadId === p.threadId;
      applyIncomingToCache(qc, p.threadId, p.message, { isOpen, myUserId });
    };
    const onThreadUpdated = () => {
      qc.invalidateQueries({ queryKey: qk.messaging.unreadCount });
    };
    const onMessageRead = (p: { threadId: string; messageIds: string[] }) => {
      applyMessagesReadToCache(qc, p.threadId, p.messageIds || []);
    };
    const onReconnect = () => {
      const tid = useMessagesStore.getState().currentThreadId;
      if (tid) {
        socket.emit('join:thread', { threadId: tid });
        qc.invalidateQueries({ queryKey: qk.messaging.messages(tid) });
      }
      qc.invalidateQueries({ queryKey: qk.messaging.threads });
      qc.invalidateQueries({ queryKey: qk.messaging.unreadCount });
    };

    socket.on('message:new', onMessageNew);
    socket.on('thread:updated', onThreadUpdated);
    socket.on('message:read', onMessageRead);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('thread:updated', onThreadUpdated);
      socket.off('message:read', onMessageRead);
      socket.io.off('reconnect', onReconnect);
    };
  }, [token, qc]);
}
