export const easing = {
  premium: "cubic-bezier(0.4, 0, 0.2, 1)",
  "bounce-soft": "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export const duration = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

export const animation = {
  "fade-in": "fadeIn 0.3s ease-out",
  "slide-up": "slideUp 0.3s ease-out",
  "slide-down": "slideDown 0.3s ease-out",
  // Kenardan giren paneller (Drawer). Ekran dışından tam genişlik kaydırılır,
  // opaklık yok: yarı saydam kayan panel altındaki içeriği okutup titretiyordu.
  "slide-in-left": "slideInLeft 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  "slide-in-right": "slideInRight 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  shimmer: "shimmer 2s infinite linear",
} as const;

export const keyframes = {
  fadeIn: {
    "0%": { opacity: "0" },
    "100%": { opacity: "1" },
  },
  slideUp: {
    "0%": { opacity: "0", transform: "translateY(10px)" },
    "100%": { opacity: "1", transform: "translateY(0)" },
  },
  slideDown: {
    "0%": { opacity: "0", transform: "translateY(-10px)" },
    "100%": { opacity: "1", transform: "translateY(0)" },
  },
  slideInLeft: {
    "0%": { transform: "translateX(-100%)" },
    "100%": { transform: "translateX(0)" },
  },
  slideInRight: {
    "0%": { transform: "translateX(100%)" },
    "100%": { transform: "translateX(0)" },
  },
  shimmer: {
    "0%": { backgroundPosition: "-200% 0" },
    "100%": { backgroundPosition: "200% 0" },
  },
} as const;

export const motion = { easing, duration, animation, keyframes } as const;

export type Motion = typeof motion;
