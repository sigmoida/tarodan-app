/** @format */

"use client";

import { create } from "zustand";

interface MobileNavState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Mobil gezinme çekmecesinin açık/kapalı durumu.
 *
 * Neden store: hamburger düğmesi `Header`'da, çekmecenin İÇERİĞİ ise duruma göre
 * başka bir ağaçta duruyor — katalog çekmecesi Header'ın yanında, profil
 * çekmecesi `ProfileShell` içinde (profil navigasyonu `ProfileProvider`'a
 * bağlı ve o sağlayıcı Header'ın ALTINDA). Prop ile geçirilemeyeceği için tek
 * paylaşılan durum burada tutulur.
 */
export const useMobileNavStore = create<MobileNavState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
