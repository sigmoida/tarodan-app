"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/context/SessionContext";
import { expiredLoginHref } from "@/lib/auth-redirect";

/**
 * Idle duration (ms) before this hook redirects to /login. Must match the
 * server's hard, non-bypassable session timeout
 * (`ADMIN_SESSION_TIMEOUT_MINUTES` in apps/api's `security.service.ts`) — a
 * longer value here just means the UI stays silent while the session is
 * already dead server-side.
 */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Process activity events at most once per this interval (reduce noise). */
const ACTIVITY_THROTTLE_MS = 5 * 1000;
/** Cross-tab sharing of last activity (not sensitive). */
const LAST_ACTIVITY_KEY = "admin_last_activity";

/**
 * Auto-logout + redirect to /login after 30 minutes of inactivity.
 * lastActivity is shared via localStorage, so activity in one tab also refreshes
 * the others' timers and the session only closes when it's truly idle.
 */
export function useIdleLogout() {
  const { logout, isAuthenticated } = useSession();
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;

    let timer: ReturnType<typeof setTimeout>;

    const triggerLogout = () => {
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      void logout(expiredLoginHref("idle", returnPath));
    };

    const schedule = () => {
      clearTimeout(timer);
      const last =
        Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - last));
      timer = setTimeout(triggerLogout, remaining);
    };

    const markActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current >= ACTIVITY_THROTTLE_MS) {
        lastWriteRef.current = now;
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      }
      schedule();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY) schedule();
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    events.forEach((ev) =>
      window.addEventListener(ev, markActivity, { passive: true }),
    );
    window.addEventListener("storage", onStorage);

    // Mark initial activity and set up the timer.
    markActivity();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthenticated, logout]);
}
