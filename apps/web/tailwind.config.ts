import type { Config } from 'tailwindcss';
import tarodanPreset from '@tarodan/ui/tailwind-preset';

const config: Config = {
  presets: [tarodanPreset as Config],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Web-specific overrides only (preset handles shared tokens)
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
      },
    },
  },
  plugins: [],
};

export default config;
