/** @format */

"use client";

import { useCallback, useRef } from "react";

/**
 * Jestin sayılması için gereken en küçük yatay mesafe (px). Daha kısa hareketler
 * kararsız parmak temasıdır — onları kaydırma saymak, kullanıcı sadece dokunmak
 * isterken görselin değişmesine yol açar.
 */
const DEFAULT_THRESHOLD = 48;

/**
 * Yatay kaydırma (swipe) jesti — dokunmatik ekranlar için.
 *
 * Fare değil YALNIZCA dokunma olayları dinlenir: fareyle sürüklemeyi jest
 * saymak, metin seçme ve sürükle-bırak gibi masaüstü davranışlarını bozardı.
 * Dikey hareket yataydan baskınsa jest yok sayılır — o, sayfanın kendi
 * kaydırmasıdır ve onu kesmek sayfayı kullanılamaz hâle getirir.
 *
 * `consumeSwipeClick`, kaydırmanın hemen ardından tarayıcının ürettiği `click`
 * olayını yutmak içindir: kaydırılabilir yüzeyin kendi `onClick`'i varsa (ör.
 * galeride büyütme) parmak kaldırıldığı anda o da tetiklenir ve kullanıcı
 * görseli değiştirmek isterken kendini büyütme ekranında bulur.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = DEFAULT_THRESHOLD,
}: {
  /** Parmak SOLA gitti — sıradaki öğe. */
  onSwipeLeft: () => void;
  /** Parmak SAĞA gitti — önceki öğe. */
  onSwipeRight: () => void;
  threshold?: number;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    origin.current = { x: touch.clientX, y: touch.clientY };
    swiped.current = false;
  }, []);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = origin.current;
      origin.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return;

      swiped.current = true;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
    [onSwipeLeft, onSwipeRight, threshold],
  );

  /** Bu tıklama az önceki kaydırmanın devamıysa `true` döner ve bayrağı sıfırlar. */
  const consumeSwipeClick = useCallback(() => {
    if (!swiped.current) return false;
    swiped.current = false;
    return true;
  }, []);

  return {
    /** Kaydırılabilir yüzeye yayılacak olay dinleyicileri. */
    swipeHandlers: { onTouchStart, onTouchEnd },
    consumeSwipeClick,
  };
}
