"use client";

import { useCallback, useState } from "react";

/**
 * Mobile sidebar open/close state (the sidebar is always visible on lg+).
 *
 * Geri çağrılar `useCallback` ile SABİT kimlikte tutulur. Her render'da yeni
 * closure üretildiğinde, bunları bağımlılık dizisinde tutan efektler (çekmecenin
 * "yol değişince kapan" ve "masaüstünde kapan" efektleri) her render'da yeniden
 * çalışıyordu: hamburger'a basmak `open=true` yapıyor, gelen render efekti
 * tetikliyor, efekt hemen kapatıyordu — panel hiç görünmüyordu.
 */
export function useSidebar() {
  const [open, setOpen] = useState(false);

  const openSidebar = useCallback(() => setOpen(true), []);
  const closeSidebar = useCallback(() => setOpen(false), []);

  return { open, openSidebar, closeSidebar };
}
