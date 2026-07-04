'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/context/SessionContext';

/** Idle duration (ms). Balanced policy: 1 hour. */
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
/** Process activity events at most once per this interval (reduce noise). */
const ACTIVITY_THROTTLE_MS = 5 * 1000;
/** Cross-tab sharing of last activity (not sensitive). */
const LAST_ACTIVITY_KEY = 'admin_last_activity';

/**
 * Auto-logout + redirect to /login after 1 hour of inactivity.
 * lastActivity is shared via localStorage, so activity in one tab also refreshes
 * the others' timers and the session only closes when it's truly idle.
 */
export function useIdleLogout() {
  const { logout, isAuthenticated } = useSession();
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;

    let timer: ReturnType<typeof setTimeout>;

    const triggerLogout = () => {
      void logout();
      // logout already redirects to /login; still add the expired marker.
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?expired=idle';
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
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
      'mousemove',
      'keydown',
      'click',
      'scroll',
      'touchstart',
    ];
    events.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));
    window.addEventListener('storage', onStorage);

    // Mark initial activity and set up the timer.
    markActivity();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      window.removeEventListener('storage', onStorage);
    };
  }, [isAuthenticated, logout]);
}
