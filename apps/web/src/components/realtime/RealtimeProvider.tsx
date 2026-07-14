"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NotificationNewEvent, ThreadUpdatedEvent } from "@tarodan/types";
import { useAuthStore } from "@/stores/authStore";
import { queryKeys } from "@/lib/query/keys";

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
 *
 * Perf (#98): `@/lib/socket` (which pulls in socket.io-client, ~50-90KB) is
 * imported DYNAMICALLY inside the effects. This provider is mounted in the
 * (main) layout, i.e. on every page including the anonymous LCP — a static
 * import would ship socket.io in that bundle even though only signed-in users
 * ever open a connection. An anonymous visitor (token === null) never triggers
 * the import, so the chunk stays out of the critical path.
 */
export function RealtimeProvider({ children }: { children?: React.ReactNode }) {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  // Did we ever open a socket? Gates the logout teardown so an anonymous
  // session never imports the socket chunk just to "disconnect" nothing.
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let detach: (() => void) | undefined;

    import("@/lib/socket").then(({ getSocket }) => {
      if (cancelled) return;
      connectedRef.current = true;
      const socket = getSocket(token);

      const onNotification = (_n: NotificationNewEvent) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.unreadCount(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all(),
        });
      };
      const onThreadUpdated = (_p: ThreadUpdatedEvent) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.threads(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.unreadCount(),
        });
      };

      socket.on("notification:new", onNotification);
      socket.on("thread:updated", onThreadUpdated);

      detach = () => {
        socket.off("notification:new", onNotification);
        socket.off("thread:updated", onThreadUpdated);
      };
    });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [token, queryClient]);

  // Logout: socket'i kapat + React Query cache'ini temizle. Aksi halde aynı
  // QueryClient bir sonraki hesaba taşınır ve önceki kullanıcının bildirim/
  // sayaç verisi görünür. Tüm logout yolları için çalışır (buton, 401, token).
  useEffect(() => {
    if (token) return;
    queryClient.clear();
    // Only reach for the socket module if we actually opened one — keeps the
    // socket.io chunk out of an anonymous visitor's bundle.
    if (!connectedRef.current) return;
    connectedRef.current = false;
    import("@/lib/socket").then(({ disconnectSocket }) => disconnectSocket());
  }, [token, queryClient]);

  return <>{children ?? null}</>;
}

export default RealtimeProvider;
