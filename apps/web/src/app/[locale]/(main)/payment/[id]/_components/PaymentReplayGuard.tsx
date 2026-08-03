"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Ödeme sayfasında Sentry Session Replay'i durdurur (PCI DSS 4.0 · 6.4.3).
 *
 * `sentry.client.config.ts` sayfaya DOĞRUDAN girişte replay'i hiç kurmaz; bu
 * bileşen ikinci katmandır: kullanıcı siteyi gezip SPA gezinmesiyle ödeme
 * sayfasına geldiğinde replay çoktan çalışıyordur. Kart alanlarının bulunduğu
 * sayfada DOM kaydeden bir script'i gerekçelendirmek yerine kaydı kapatıyoruz.
 *
 * Kayıt bilinçli olarak yeniden BAŞLATILMAZ: ödeme sonrası akış (success/fail)
 * tam sayfa gezinmedir, replay orada init ile normal örneklemeyle yeniden kurulur.
 */
export default function PaymentReplayGuard() {
  useEffect(() => {
    Sentry.getReplay()?.stop();
  }, []);

  return null;
}
