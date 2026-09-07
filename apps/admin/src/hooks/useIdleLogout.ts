"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { expiredLoginHref } from "@/lib/auth-redirect";
import {
  getSessionDeadline,
  startSessionDeadlineSync,
  subscribeSessionDeadline,
} from "@/lib/session-deadline";

/** setTimeout gecikmesi 32 bit signed'a sığmalı; üstü taşıp hemen tetikler. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Oturum süresi dolduğunda paneli login'e taşır.
 *
 * Süreyi ARTIK BURASI BİLMİYOR. Eskiden sabit 30 dakikaydı ve yorumu
 * "sunucudaki `ADMIN_SESSION_TIMEOUT_MINUTES` ile aynı olmalı" diyordu — süre
 * ayardan gelir hale gelince bu sabit sessizce sapardı: yönetici süreyi 4 saate
 * çıkarsa panel yine 30 dakikada atardı. Tek doğru kaynak sunucunun bildirdiği
 * son tarihtir (`x-admin-session-expires-at`), o da her admin yanıtında tazelenir.
 *
 * Aktivite dinlemesi de kalktı: pencereyi ileri iten şey fare hareketi değil,
 * İSTEKTİR. Fare oynatmak oturumu canlı tutuyor sanmak, kullanıcıyı sunucuda
 * çoktan ölmüş bir oturumla çalışıyor bırakıyordu. Kullanıcının "buradayım"
 * demesi artık boşta kalma uyarısındaki "Devam et" ile olur (SessionIdleWarning).
 */
export function useIdleLogout() {
  const { logout, isAuthenticated } = useSession();
  const [deadline, setDeadline] = useState<number | null>(null);

  useEffect(() => {
    // ÖNCE abone ol: startSessionDeadlineSync depodaki değeri okuyup hemen
    // yayınlıyor; abonelik sonra kurulursa taze açılan sekme o bildirimi kaçırır
    // ve bir sonraki yanıt gelene kadar hiç çıkış zamanlayıcısı kurulmaz.
    const unsubscribe = subscribeSessionDeadline(setDeadline);
    const stopSync = startSessionDeadlineSync();
    setDeadline(getSessionDeadline());
    return () => {
      stopSync();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || deadline === null) return;
    if (typeof window === "undefined") return;

    const fire = () => {
      const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      void logout(expiredLoginHref("idle", returnPath));
    };

    // setTimeout gecikmesi 32 bit'e sığmazsa (≈24.8 gün) taşar ve zamanlayıcı
    // HEMEN tetiklenir; ayarın üst sınırı olmadığı için uzun bir süre,
    // kullanıcıyı anında dışarı atardı. Sınırda uyanıp yeniden kur.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        fire();
        return;
      }
      timer = setTimeout(schedule, Math.min(remaining, MAX_TIMEOUT_MS));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [isAuthenticated, deadline, logout]);
}
