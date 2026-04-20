import type { Config } from 'tailwindcss';

/**
 * Tarodan Design System — Shared Tailwind Preset
 *
 * Merkezi renk paleti, golge, animasyon ve tipografi tanimlari.
 * Web ve Admin app'leri bu preset'i kullanir.
 * App-specific override'lar kendi tailwind.config'lerinde yapilir.
 */
const tarodanPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Primary — Orange
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // Semantic text colors
        heading: '#1A1A1A',
        body: '#333333',
        muted: '#666666',
        subtle: '#999999',
        // Surface / background
        surface: {
          DEFAULT: '#FAFAFA',
          alt: '#F5F5F7',
        },
        // Semantic action colors (standardized)
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        info: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(0,0,0,0.08)',
        medium: '0 4px 16px -4px rgba(0,0,0,0.12)',
        elevated: '0 8px 30px -8px rgba(0,0,0,0.16)',
        premium: '0 12px 40px -12px rgba(0,0,0,0.2)',
        'inner-soft': 'inset 0 1px 3px 0 rgba(0,0,0,0.06)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce-soft': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        shimmer: 'shimmer 2s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
};

export default tarodanPreset;
