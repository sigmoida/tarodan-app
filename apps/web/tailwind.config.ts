import type { Config } from 'tailwindcss';
import tarodanPreset from '@tarodan/design-tokens/tailwind';

const config: Config = {
  presets: [tarodanPreset as Config],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  // All design tokens (colors, radius, spacing, typography, ...) come from the
  // preset (@tarodan/design-tokens/tailwind). Keep app-specific overrides only.
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
