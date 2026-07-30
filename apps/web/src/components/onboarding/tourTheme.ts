/** @format */

import {
  primary,
  radius,
  shadows,
  surface,
  text,
  typography,
} from "@tarodan/design-tokens";
import type { Props as JoyrideProps } from "react-joyride";

/**
 * Tanıtım turlarının TEK görsel kaynağı — Joyride inline stil aldığı için Tailwind
 * sınıfları kullanılamaz, bu yüzden değerler design-token'lardan okunur (sabit hex
 * yazmak hem kural ihlali hem de tema kaydığında sessizce eskiyen bir kopya olurdu).
 */

/**
 * Kaydırma ofseti — turun en görünür hatasının kaynağı buydu.
 *
 * Joyride hedefi sayfanın üstüne kaydırıyor, ama sticky başlık bloğu orada
 * duruyor ve spotlight'ın üstüne biniyordu (kartın "altta yakalanması"). Blok
 * ana bar + kategori barını birlikte taşıdığı ve kategori barı sayfaya göre
 * görünüp kaybolduğu için yükseklik SABİT DEĞİL: gerçek düğümü ölçüyoruz.
 */
const STICKY_HEADER_FALLBACK = 64;
const SCROLL_BREATHING_ROOM = 24;

export function resolveScrollOffset(): number {
  if (typeof document === "undefined") {
    return STICKY_HEADER_FALLBACK + SCROLL_BREATHING_ROOM;
  }
  const sticky = document.querySelector("[data-sticky-header]");
  const height = sticky?.getBoundingClientRect().height ?? 0;
  return (height > 0 ? height : STICKY_HEADER_FALLBACK) + SCROLL_BREATHING_ROOM;
}

/** Kart genişliği: dar görünmemesi için geniş, ama mobilde ekranı taşırmamalı. */
const TOOLTIP_WIDTH = 400;

export function tourOptions(): NonNullable<JoyrideProps["options"]> {
  return {
    blockTargetInteraction: true,
    buttons: ["back", "primary", "skip"],
    closeButtonAction: "skip",
    dismissKeyAction: false,
    overlayClickAction: false,
    // Arka plan: koyu ama içeriği tamamen boğmayacak yoğunlukta.
    overlayColor: "rgba(26, 26, 26, 0.66)",
    primaryColor: primary[600],
    showProgress: true,
    skipBeacon: true,
    // Hedefin kenarları spotlight'a değmesin; çerçeve ürün kartını tam kapsasın.
    spotlightPadding: 10,
    spotlightRadius: radius.xl,
    scrollOffset: resolveScrollOffset(),
    scrollDuration: 400,
    targetWaitTimeout: 2000,
    textColor: text.body,
    width: TOOLTIP_WIDTH,
    // Token ölçeği toast=70'te bitiyor ama uygulamada `z-[100]` (hesap menüsü,
    // arama dropdown'ı) ve `z-[9999]` (çerez bandı) kaçışları var. Tur, uygulama
    // kromunun ÜSTÜNDE ama çerez onayının ALTINDA kalmalı: onay tıklanabilir
    // kalsın, tur da menülerin arkasına düşmesin.
    zIndex: 1200,
  };
}

export function tourStyles(): NonNullable<JoyrideProps["styles"]> {
  return {
    tooltip: {
      backgroundColor: surface.elevated,
      borderRadius: radius["3xl"],
      boxShadow: shadows.premium,
      // Mobilde 400px ekranı taşırıyordu; kenar boşluğu bırakarak sınırla.
      maxWidth: "calc(100vw - 32px)",
      padding: 20,
    },
    tooltipTitle: {
      color: text.heading,
      // Başlıklar 20px'ti ve kart içinde iri duruyordu; içerikle aynı ölçekten.
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.snug,
      margin: 0,
      textAlign: "left",
    },
    tooltipContent: {
      color: text.body,
      fontSize: typography.fontSize.sm,
      lineHeight: typography.lineHeight.normal,
      padding: "8px 0 0",
      textAlign: "left",
    },
    tooltipFooter: {
      marginTop: 16,
    },
    buttonPrimary: {
      backgroundColor: primary[600],
      borderRadius: radius.lg,
      color: text.inverted,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      padding: "8px 16px",
    },
    buttonBack: {
      color: text.muted,
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      marginRight: 8,
    },
    buttonSkip: {
      color: text.subtle,
      fontSize: typography.fontSize.sm,
    },
    buttonClose: {
      color: text.subtle,
      height: 12,
      width: 12,
    },
    spotlight: {
      // Hedefin nerede bittiği net görünsün: spotlight kenarına ince çerçeve.
      stroke: primary[400],
      strokeWidth: 2,
    },
    arrow: {
      // Ok, kartla aynı yüzey renginde olmalı; yoksa kartın altında ayrı bir
      // üçgen gibi duruyor.
      color: surface.elevated,
    },
  };
}
