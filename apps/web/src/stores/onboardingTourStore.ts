"use client";

import { create } from "zustand";

/**
 * Tanıtım turu şu an ekranda mı — turun üstüne binmemesi gereken katmanlar
 * (reklam popup'ı) okur. Değeri yalnız `OnboardingTour` yazar.
 */
interface OnboardingTourState {
  running: boolean;
  setRunning: (running: boolean) => void;
}

export const useOnboardingTourStore = create<OnboardingTourState>()((set) => ({
  running: false,
  setRunning: (running) => set({ running }),
}));
