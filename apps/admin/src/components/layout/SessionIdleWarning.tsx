"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import {
  getSessionDeadline,
  subscribeSessionDeadline,
} from "@/lib/session-deadline";

/** Uyarının, oturum bitmeden ne kadar önce çıkacağı. */
const WARN_BEFORE_MS = 2 * 60_000;
/** Geri sayım adımı. Saniye gösterildiği için saniyelik. */
const TICK_MS = 1_000;

/**
 * Boşta kalma uyarısı.
 *
 * Neden gerekli: oturumu bitiren sayaç sunucuda (`admin_sessions.expires_at`,
 * kayan pencere) ve tarayıcıya hiçbir işaret göndermiyordu — kullanıcı bir
 * sonraki tıklamasında sebepsizce login ekranında buluyordu kendini. Süre
 * uzatılsa bile bu bir gün dolacak, o yüzden uyarı süreden bağımsız gerekli.
 *
 * Süre DOLDUĞUNDA çıkışı bu bileşen değil `useIdleLogout` yapar — tek ejektör
 * olsun diye. Burası yalnız uyarır.
 *
 * Son tarih, kullanıcının zaten yaptığı isteklerin yanıt başlığından geliyor;
 * bu bileşen kendiliğinden hiçbir istek atmaz — atsaydı pencereyi uzatır ve
 * uyarı hiç görünmezdi. "Devam et" ise BİLİNÇLİ bir istektir: kullanıcı orada
 * olduğunu söylediği için pencere ilerler.
 */
export function SessionIdleWarning() {
  const t = useTranslations();
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    setDeadline(getSessionDeadline());
    return subscribeSessionDeadline(setDeadline);
  }, []);

  useEffect(() => {
    if (deadline === null) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(deadline - Date.now());
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [deadline]);

  const extend = useCallback(async () => {
    setExtending(true);
    try {
      // Herhangi bir admin isteği pencereyi ileri iter; profil ucu en ucuzu.
      // Yanıtın başlığı yeni son tarihi getirir, depo kendini günceller.
      await adminApi.extendAdminSession();
    } catch {
      // Yutuluyor: istek başarısızsa son tarih ilerlemez, geri sayım sürer ve
      // süre dolduğunda useIdleLogout zaten çıkışı yapar. Yakalamazsak
      // onClick'in döndürdüğü promise reddedilip yakalanmamış hata üretirdi.
    } finally {
      setExtending(false);
    }
  }, []);

  const open =
    remainingMs !== null && remainingMs > 0 && remainingMs <= WARN_BEFORE_MS;
  if (!open) return null;

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;

  return (
    <Modal
      isOpen
      // Kapatma yollarını kapalı tut: "kapat" burada oturumu uzatmaz, sadece
      // uyarıyı gizler ve kullanıcı yine habersiz atılırdı.
      onClose={() => undefined}
      closeOnBackdrop={false}
      closeOnEscape={false}
      showCloseButton={false}
      size="sm"
      title={t("admin.session.idleWarning.title")}
      description={t("admin.session.idleWarning.description", { time: mmss })}
      footer={
        <Button onClick={extend} isLoading={extending} className="w-full">
          {t("admin.session.idleWarning.stayLoggedIn")}
        </Button>
      }
    >
      <p
        className="text-center text-3xl font-semibold tabular-nums text-primary-700"
        role="timer"
        aria-live="off"
      >
        {mmss}
      </p>
    </Modal>
  );
}
