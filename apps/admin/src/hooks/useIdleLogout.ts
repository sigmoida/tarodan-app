'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/session-context';

/** Hareketsizlik süresi (ms). Balanced politika: 1 saat. */
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
/** Aktivite olaylarını bu aralıkta en çok bir kez işle (gürültüyü azalt). */
const ACTIVITY_THROTTLE_MS = 5 * 1000;
/** Sekmeler arası son aktivite paylaşımı (hassas değil). */
const LAST_ACTIVITY_KEY = 'admin_last_activity';

/**
 * 1 saat hareketsizlikte otomatik logout + /login'e yönlendirme.
 * lastActivity localStorage'da paylaşılır; böylece bir sekmedeki aktivite diğerlerinin
 * timer'ını da tazeler ve oturum gerçekten boştayken kapanır.
 */
export function useIdleLogout() {
  const { logout, isAuthenticated } = useSession();
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;

    let timer: ReturnType<typeof setTimeout>;

    const triggerLogout = () => {
      void logout();
      // logout zaten /login'e yönlendiriyor; expired işareti için yine de ekle.
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

    // İlk aktiviteyi işaretle ve timer'ı kur.
    markActivity();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      window.removeEventListener('storage', onStorage);
    };
  }, [isAuthenticated, logout]);
}
