"use client";

import { create } from "zustand";

/**
 * Which boost layers are on screen, so other dismissible layers never stack
 * on them. `openDialogs` counts the boost dialogs open from any launcher
 * (My listings, a listing card, My boosts, the offer); only
 * `useBoostLauncher` writes it. `offerOpen` is the one-time offer dialog;
 * only `BoostOfferHost` writes it. The offer waits while a boost dialog is
 * open, and the popup ad waits for both.
 */
interface BoostDialogState {
  openDialogs: number;
  offerOpen: boolean;
  dialogOpened: () => void;
  dialogClosed: () => void;
  setOfferOpen: (open: boolean) => void;
}

export const useBoostDialogStore = create<BoostDialogState>()((set) => ({
  openDialogs: 0,
  offerOpen: false,
  dialogOpened: () => set((s) => ({ openDialogs: s.openDialogs + 1 })),
  dialogClosed: () =>
    set((s) => ({ openDialogs: Math.max(0, s.openDialogs - 1) })),
  setOfferOpen: (offerOpen) => set({ offerOpen }),
}));
