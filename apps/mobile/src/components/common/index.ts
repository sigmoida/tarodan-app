/**
 * Mobile common components — köprü dosyası.
 *
 * Migrasyon sırasında dokunulmamış ekranların import path'leri kırılmadan
 * çalışsın diye `@tarodan/ui-native`'den re-export ediyoruz. YENİ ekranlar
 * doğrudan `@tarodan/ui-native`'den import etmeli (lint kuralları zorlar).
 *
 * Hâlâ yerelde kalanlar (domain-specific): AuthRequiredSheet, CommissionPreview,
 * CityDistrictSelector, PaperCompat (Text/TextInput/Searchbar/CardCover wrapper).
 */

export {
  ScreenHeader,
  EmptyState,
  ErrorState,
  ScreenLoader,
} from '@tarodan/ui-native';

export { default as AuthRequiredSheet } from './AuthRequiredSheet';
export { default as CommissionPreview } from './CommissionPreview';
export { default as CityDistrictSelector } from './CityDistrictSelector';

// Paper wrapper'ları — `react-native-paper` Text/TextInput/Searchbar/CardCover
// için TS prop uyumluluğu. Migration ilerleyince bu da kalkacak.
export { Text, TextInput, Searchbar, CardCover } from './PaperCompat';
export type { TextProps, TextInputProps, SearchbarProps, CardCoverProps } from './PaperCompat';
