/**
 * Common Components Index
 */

export { default as Button } from './Button';
export { default as Input } from './Input';
export { default as ScreenHeader } from './ScreenHeader';
export { default as EmptyState } from './EmptyState';
export { default as ScreenLoader } from './ScreenLoader';
export { default as ErrorState } from './ErrorState';
export { default as AuthRequiredSheet } from './AuthRequiredSheet';
export { default as CommissionPreview } from './CommissionPreview';
export { default as CityDistrictSelector } from './CityDistrictSelector';

// Paper wrappers — Paper'ın Text/TextInput bileşenlerini RN prop'larıyla birlikte export eder.
// Yeni ekranlarda `react-native-paper` yerine buradan import edin ki keyboardType/numberOfLines
// gibi prop'lar TS tarafından tanınsın.
export { Text, TextInput, Searchbar, CardCover } from './PaperCompat';
export type { TextProps, TextInputProps, SearchbarProps, CardCoverProps } from './PaperCompat';
