"use client";

import { create } from "zustand";

/**
 * Zorunlu adımların (onaylar, yasal kimlik) bitip bitmediği — kapatılabilir
 * katmanların (çerez bandı, tanıtım turu) sırasını bekleyebilmesi için.
 *
 * Değeri yalnız `RequiredStepsGate` yazar (sorgu katmanının içinde). Çerez
 * bandı kök düzende, sorgu sağlayıcısının DIŞINDA durduğu için sorguyu kendisi
 * okuyamaz; buradan okur. Kapı hiç takılmayan sayfalarda (giriş/kayıt)
 * varsayılan `false` kalır, yani bant normal açılır.
 */
interface RequiredStepsState {
  outstanding: boolean;
  setOutstanding: (outstanding: boolean) => void;
}

export const useRequiredStepsStore = create<RequiredStepsState>()((set) => ({
  outstanding: false,
  setOutstanding: (outstanding) => set({ outstanding }),
}));
