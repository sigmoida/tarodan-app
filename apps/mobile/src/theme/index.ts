/**
 * Data-constants bridge.
 *
 * Legacy `TarodanColors` hardcoded palet KALDIRILDI — renkler artık
 * `@tarodan/ui-native`'in `theme.colors` (design tokens) üzerinden geliyor.
 * Bu dosya yalnız veri sabitlerini (SCALES, BRANDS, CONDITIONS) export eder.
 *
 * Yeni kodda renk için `theme.colors` (ui-native) kullan.
 */

export { SCALES, BRANDS, CONDITIONS } from './colors';
