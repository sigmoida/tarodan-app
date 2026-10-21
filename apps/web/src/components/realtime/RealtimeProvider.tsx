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
 *   - notification:new → notification badge + list
 *   - thread:updated    → thread list + unread message count
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
 *
 * Dormant today: since tokens moved to httpOnly cookies, `authStore.token` is
 * always null and the API socket only accepts a bearer token in the handshake,
 * so neither effect below connects. Restoring it needs a socket credential the
 * cookie session can hand out (tracked in the tarodan-ops backlog).
 *
 * The query cache is NOT cleared here: that is keyed on the session owner in
 * the auth store (`lib/query/sessionCache`), which sees every sign-out path.
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
        queryClient.invalidateQueries({
          queryKey: queryKeys.offers.pendingCount(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.trades.pendingCount(),
        });
        // Order notifications (shipped / delivered / shipping code ready)
        // also refresh the open order list and order screen.
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail() });
      };
      const onThreadUpdated = (_p: ThreadUpdatedEvent) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.threads(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.unreadCount(),
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

  // Logout: close the socket. Only reach for the socket module if we actually
  // opened one, which keeps the socket.io chunk out of a guest's bundle.
  useEffect(() => {
    if (token || !connectedRef.current) return;
    connectedRef.current = false;
    import("@/lib/socket").then(({ disconnectSocket }) => disconnectSocket());
  }, [token]);

  return <>{children ?? null}</>;
}

export default RealtimeProvider;
