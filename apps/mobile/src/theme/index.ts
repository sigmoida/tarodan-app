import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { TarodanColors } from './colors';

export const TarodanLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: TarodanColors.primary,
    primaryContainer: TarodanColors.primaryLight,
    secondary: TarodanColors.secondary,
    secondaryContainer: TarodanColors.secondaryLight,
    tertiary: TarodanColors.accent,
    tertiaryContainer: TarodanColors.accentLight,
    background: TarodanColors.background,
    surface: TarodanColors.surface,
    surfaceVariant: TarodanColors.surfaceVariant,
    error: TarodanColors.error,
    onPrimary: TarodanColors.textOnPrimary,
    onSecondary: TarodanColors.textOnPrimary,
    onBackground: TarodanColors.textPrimary,
    onSurface: TarodanColors.textPrimary,
    outline: TarodanColors.border,
    outlineVariant: TarodanColors.borderLight,
  },
  roundness: 12,
};

export const TarodanDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: TarodanColors.primary,
    primaryContainer: TarodanColors.primaryDark,
    secondary: '#B2BEC3',
    secondaryContainer: '#636E72',
    tertiary: TarodanColors.accent,
    tertiaryContainer: TarodanColors.accentLight,
    background: '#1A1A1A',
    surface: '#242424',
    surfaceVariant: '#2D2D2D',
    error: TarodanColors.error,
    onPrimary: TarodanColors.textOnPrimary,
    onSecondary: TarodanColors.textPrimary,
    onBackground: '#FFFFFF',
    onSurface: '#FFFFFF',
    outline: '#404040',
    outlineVariant: '#333333',
  },
  roundness: 12,
};

export { TarodanColors, SCALES, BRANDS, CONDITIONS } from './colors';
