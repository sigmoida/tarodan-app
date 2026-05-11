/**
 * Legacy theme bridge.
 *
 * Tüm UI bileşenleri artık `@tarodan/ui-native`'den geliyor ve renkler
 * `@tarodan/design-tokens` semantic token'larından besleniyor. Bu dosya
 * sadece eski `TarodanColors` referansları ile veri sabitleri (BRANDS,
 * SCALES, CONDITIONS) export ediyor.
 *
 * Yeni kodda dokunma — UI için `theme.colors` ui-native'den, veri için
 * `@tarodan/types` veya `@tarodan/core`'dan al.
 */

export { TarodanColors, SCALES, BRANDS, CONDITIONS } from './colors';
