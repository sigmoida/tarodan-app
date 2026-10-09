/** @format */

"use client";

import { useEffect, useState } from "react";

export type AdDeviceType = "desktop" | "mobile";

/** Tailwind `md` eşiği: altı mobil afiş setidir. */
export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/**
 * Cihaz türü — afiş çekimlerinin tek kaynağı. İlk değer `null` (bilinmiyor):
 * SSR'da ve ilk istemci çiziminde ölçüm yok; çağıranlar `null` iken istek
 * atmamalı, yoksa masaüstü seti çekilip sonra mobil setle değiştirilir.
 */
export function useDeviceType(): AdDeviceType | null {
  const [device, setDevice] = useState<AdDeviceType | null>(null);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);
    const sync = () => setDevice(query.matches ? "mobile" : "desktop");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return device;
}
