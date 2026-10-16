/** @format */

"use client";

import { useEffect, useState } from "react";

export type AdDeviceType = "desktop" | "mobile";

/** Tailwind `md` eşiği: altı mobil afiş setidir. */
export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/**
 * Cihaz türü — YALNIZ geçiş dönemi için: afiş isteği `platform=web` ile
 * birlikte eski `device` parametresini de taşır. Yeni API platformu esas alır
 * ve `device`'ı yok sayar. Web, API'den ÖNCE yayına çıkarsa eski API
 * `platform`'u tanımaz ve `device` ile süzer — sonuç bugünküyle aynı kalır
 * (parametresiz istek eski API'de her cihazın reklamını döndürürdü). API
 * yayına çıktıktan bir sürüm sonra kaldırılır.
 *
 * İlk değer `null` (bilinmiyor): SSR'da ve ilk istemci çiziminde ölçüm yok;
 * çağıranlar `null` iken istek atmamalı, yoksa masaüstü seti çekilip sonra
 * mobil setle değiştirilir.
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
