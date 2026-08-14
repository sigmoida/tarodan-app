import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import {
  colors,
  radius,
  spacing,
  shadows,
  motion,
  typography,
  zIndex,
} from "./index";

/**
 * Tarodan Design System — Shared Tailwind Preset (web adapter)
 *
 * The single source of truth for every design decision is this package's raw
 * tokens (colors, radius, spacing, typography, shadows, motion). This preset
 * is the web adapter that projects those tokens onto a Tailwind theme.
 *
 * Consumed by apps/web and apps/admin via `@tarodan/design-tokens/tailwind`.
 * Apps should NOT re-declare tokens (colors/radius/spacing) in their own
 * tailwind.config — only truly app-specific bits (content globs, one-off
 * animations) belong there.
 */

/** Numeric px tokens → Tailwind length strings (radius stays in px). */
const toPx = (obj: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, `${v}px`]));

/**
 * Numeric px tokens → rem (web keeps rem so spacing scales with the user's
 * root font-size; the native adapter keeps the same values as raw px).
 */
const toRem = (obj: Record<string, number>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === 0 ? "0px" : `${v / 16}rem`]),
  );

/**
 * Güvenli alan (safe area) yardımcıları.
 *
 * Çentikli ve yuvarlak köşeli ekranlarda ekranın kenarları sistem tarafından
 * kullanılır: üstte durum çubuğu, altta ana ekran çizgisi, YATAY kullanımda
 * solda/sağda çentik. Bu şeritlere denk gelen içerik ya kesilir ya da
 * dokunulamaz olur. `env(safe-area-inset-*)` her kenar için o şeridin
 * kalınlığını verir.
 *
 * `env()` YALNIZCA belge `viewport-fit=cover` ile yayınlandığında sıfırdan
 * farklı döner (apps/web → `app/layout.tsx`'teki `viewport.viewportFit`).
 * Kapalıyken bu yardımcılar sıfır ekler, yani düzen olduğu gibi kalır —
 * güvenle her yere yazılabilirler.
 *
 * DİKKAT: `p*-safe` boşluğu EKLEMEZ, ATAR. Aynı kenarda zaten bir `p-4` varsa
 * onu ezer (ya da ezilir — ikisi de yalın sınıf, kazanan sıraya kalır). Mevcut
 * bir boşluğa güvenli alanı eklemek gerektiğinde ya `px-gutter` gibi birleşik
 * bir yardımcı kullanın ya da değeri açıkça yazın:
 * `pb-[calc(1rem+env(safe-area-inset-bottom))]`.
 */
const safeAreaPlugin = plugin(({ addUtilities }) => {
  addUtilities({
    ".pt-safe": { paddingTop: "env(safe-area-inset-top)" },
    ".pb-safe": { paddingBottom: "env(safe-area-inset-bottom)" },
    ".pl-safe": { paddingLeft: "env(safe-area-inset-left)" },
    ".pr-safe": { paddingRight: "env(safe-area-inset-right)" },
    ".px-safe": {
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
    },
    /**
     * Sayfa kenar boşluğu. İki işi birden yapar:
     *
     * 1. Ekranla birlikte ölçeklenir — `clamp` telefonda 1rem verir, ekran
     *    büyüdükçe 2rem'e kadar açılır. Sabit 1rem, geniş ekranda içeriği
     *    kenara yapışık bırakıyordu.
     * 2. Yatay çentik bu değerden genişse onun kadar olur, böylece yatay
     *    kullanımda metin çentiğin altına girmez.
     */
    ".px-gutter": {
      paddingLeft: "max(clamp(1rem, 2vw, 2rem), env(safe-area-inset-left))",
      paddingRight: "max(clamp(1rem, 2vw, 2rem), env(safe-area-inset-right))",
    },
  });
});

const tarodanPreset: Partial<Config> = {
  plugins: [safeAreaPlugin],
  theme: {
    /**
     * Kırılım noktaları — Tailwind'in varsayılan listesi, başına `xs` eklenmiş.
     *
     * Varsayılanda ilk basamak `sm:640px` olduğu için 360px'lik bir telefon ile
     * 600px'lik bir tablet AYNI stili alıyordu: iki sütunlu form satırları dar
     * telefonda sıkışıyor, tek sütuna indirildiğinde de aradaki ekranlar
     * gereksiz yere tek sütunda kalıyordu. `xs` o boşluğu kapatır.
     *
     * 400px sınırı cihazlara göre seçildi: yaygın dar telefonlar (375 iPhone SE,
     * 390 iPhone 14, 360 Android) ALTINDA kalır — orada tek sütun; geniş
     * telefonlar (412 Galaxy, 430 iPhone Pro Max) üstünde kalır — orada iki
     * sütun. Doğru taraf hangisiyse çağıran yer ona göre `xs:` yazar.
     *
     * `extend` DEĞİL, tam liste: `extend.screens` yeni basamağı listenin sonuna
     * eklerdi ve `xs:` kuralları CSS'te `sm:`den SONRA yazılıp onları ezerdi.
     */
    screens: {
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        primary: colors.primary,
        danger: colors.danger,
        success: colors.success,
        info: colors.info,
        warning: colors.warning,
        border: {
          DEFAULT: colors.border.DEFAULT,
          strong: colors.border.strong,
          subtle: colors.border.subtle,
        },
        heading: colors.text.heading,
        body: colors.text.body,
        muted: colors.text.muted,
        subtle: colors.text.subtle,
        surface: {
          DEFAULT: colors.surface.DEFAULT,
          alt: colors.surface.alt,
          elevated: colors.surface.elevated,
        },
      },
      textColor: {
        heading: colors.text.heading,
        body: colors.text.body,
        muted: colors.text.muted,
        subtle: colors.text.subtle,
        inverted: colors.text.inverted,
      },
      borderColor: {
        border: colors.border.DEFAULT,
        "border-strong": colors.border.strong,
        "border-subtle": colors.border.subtle,
      },
      backgroundColor: {
        surface: colors.surface.DEFAULT,
        "surface-alt": colors.surface.alt,
        "surface-elevated": colors.surface.elevated,
      },
      fontFamily: {
        sans: [...typography.fontFamily.sans],
        display: [...typography.fontFamily.display],
      },
      // Only the sub-`xs` caption token is projected here; `xs`/`sm`/`base`/…
      // keep Tailwind's defaults (same px values, with their tuned line-heights).
      // This adds `text-2xs` (10px) so dense labels/badges stop hand-rolling
      // arbitrary `text-[10px]` sizes.
      fontSize: {
        "2xs": `${typography.fontSize["2xs"] / 16}rem`,
      },
      borderRadius: toPx(radius),
      spacing: toRem(spacing),
      boxShadow: shadows,
      transitionTimingFunction: motion.easing,
      animation: motion.animation,
      keyframes: motion.keyframes,
      zIndex: {
        "navigation-overlay": String(zIndex.navigationOverlay),
        navigation: String(zIndex.navigation),
        overlay: String(zIndex.overlay),
        modal: String(zIndex.modal),
        popover: String(zIndex.popover),
        toast: String(zIndex.toast),
      },
    },
  },
};

export default tarodanPreset;
