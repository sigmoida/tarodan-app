'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationNewEvent, ThreadUpdatedEvent } from '@tarodan/types';
import { useAuthStore } from '@/stores/authStore';
import { getSocket, disconnectSocket } from '@/lib/socket';

/**
 * Global realtime listeners that must run on EVERY page (notification toast/badge,
 * unread counts, thread-list freshness) — mirrors mobile's _layout.tsx behaviour.
 *
 * Registers ONLY the global socket events:
 *   - notification:new → bildirim sayacı + listesi
 *   - thread:updated    → mesaj listesi + okunmamış sayacı
 *
 * Thread-scoped events (message:new / message:read / typing) stay in
 * useMessagingSocket so they only fire on the messages page.
 */
export function RealtimeProvider({ children }: { children?: React.ReactNode }) {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);

    const onNotification = (_n: NotificationNewEvent) => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    const onThreadUpdated = (_p: ThreadUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    };

    socket.on('notification:new', onNotification);
    socket.on('thread:updated', onThreadUpdated);

    return () => {
      socket.off('notification:new', onNotification);
      socket.off('thread:updated', onThreadUpdated);
    };
  }, [token, queryClient]);

  // Logout: socket'i kapat + React Query cache'ini temizle. Aksi halde aynı
  // QueryClient bir sonraki hesaba taşınır ve önceki kullanıcının bildirim/
  // sayaç verisi görünür. Tüm logout yolları için çalışır (buton, 401, token).
  useEffect(() => {
    if (!token) {
      disconnectSocket();
      queryClient.clear();
    }
  }, [token, queryClient]);

  return <>{children ?? null}</>;
}

export default RealtimeProvider;
