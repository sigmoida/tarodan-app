'use client';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  MessageNewEvent, ThreadUpdatedEvent, MessageReadEvent,
  NotificationNewEvent, TypingEvent,
} from '@tarodan/types';
import { useAuthStore } from '@/stores/authStore';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { mergeMessages } from '@/lib/messageMerge';

export function useMessagingSocket({ activeThreadId }: { activeThreadId?: string | null }) {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const activeRef = useRef<string | null | undefined>(activeThreadId);
  activeRef.current = activeThreadId;

  // Connect + global listeners
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);

    const onMessageNew = (payload: MessageNewEvent) => {
      // Açık sohbete ekle (id-dedupe)
      if (payload.threadId === activeRef.current) {
        queryClient.setQueryData<any[]>(['messages', payload.threadId], (old) =>
          mergeMessages(old ?? [], payload.message as any),
        );
      }
      // Önizleme listesini tazele
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    };
    const onThreadUpdated = (_p: ThreadUpdatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    };
    const onMessageRead = (p: MessageReadEvent) => {
      if (p.threadId === activeRef.current) {
        queryClient.invalidateQueries({ queryKey: ['messages', p.threadId] });
      }
    };
    const onNotification = (_n: NotificationNewEvent) => {
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    const onTypingStart = (t: TypingEvent) => {
      if (t.threadId === activeRef.current && t.userId !== currentUserId) {
        setTypingUserIds((ids) => (ids.includes(t.userId) ? ids : [...ids, t.userId]));
      }
    };
    const onTypingStop = (t: TypingEvent) => {
      setTypingUserIds((ids) => ids.filter((id) => id !== t.userId));
    };
    // Reconnect → catch-up: açık thread'in mesajlarını yeniden çek
    const onReconnect = () => {
      if (activeRef.current) {
        socket.emit('join:thread', { threadId: activeRef.current });
        queryClient.invalidateQueries({ queryKey: ['messages', activeRef.current] });
      }
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    };

    socket.on('message:new', onMessageNew);
    socket.on('thread:updated', onThreadUpdated);
    socket.on('message:read', onMessageRead);
    socket.on('notification:new', onNotification);
    socket.on('typing:started', onTypingStart);
    socket.on('typing:stopped', onTypingStop);
    socket.io.on('reconnect', onReconnect);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('thread:updated', onThreadUpdated);
      socket.off('message:read', onMessageRead);
      socket.off('notification:new', onNotification);
      socket.off('typing:started', onTypingStart);
      socket.off('typing:stopped', onTypingStop);
      socket.io.off('reconnect', onReconnect);
    };
  }, [token, currentUserId, queryClient]);

  // Join/leave active thread room
  useEffect(() => {
    if (!token || !activeThreadId) return;
    const socket = getSocket(token);
    socket.emit('join:thread', { threadId: activeThreadId });
    setTypingUserIds([]);
    return () => {
      socket.emit('leave:thread', { threadId: activeThreadId });
    };
  }, [token, activeThreadId]);

  // Disconnect on logout
  useEffect(() => {
    if (!token) disconnectSocket();
  }, [token]);

  return { typingUserIds };
}
