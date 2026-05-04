/**
 * Paper'ın Text ve TextInput bileşenlerinin RN prop'larını eksiksiz açığa çıkaran
 * tip-güvenli wrapper'lar.
 *
 * Neden gerekli:
 *   react-native-paper 5.14.5 + React 19 + TypeScript kombinasyonunda,
 *   Paper'ın `React.ComponentProps<typeof NativeText>` ve
 *   `React.ComponentPropsWithRef<typeof NativeTextInput>` tip kesişimleri
 *   `numberOfLines`, `keyboardType`, `autoCapitalize`, `maxLength`,
 *   `secureTextEntry` gibi RN prop'larını düşürüyor. Runtime'da prop'lar
 *   sorunsuz iletilse de TS hata veriyor.
 *
 *   Bu wrapper Paper bileşenlerini alır, tip imzalarını RN `TextProps` /
 *   `TextInputProps` ile birleştirip yeniden export eder. Davranış
 *   tamamen aynıdır; yalnızca tip genişletilir.
 *
 * Kullanım:
 *   import { Text, TextInput } from '@/components/common';
 *   <Text numberOfLines={2} variant="titleMedium">...</Text>
 *   <TextInput mode="outlined" keyboardType="email-address" maxLength={120} />
 */

import * as React from 'react';
import type { TextInputProps as RNTextInputProps, TextProps as RNTextProps } from 'react-native';
import type { ImageProps as RNImageProps, StyleProp, ViewStyle } from 'react-native';
import {
  Text as PaperText,
  TextInput as PaperTextInput,
  Searchbar as PaperSearchbar,
  Card as PaperCard,
} from 'react-native-paper';

type PaperTextProps = React.ComponentProps<typeof PaperText>;
type PaperTextInputProps = React.ComponentProps<typeof PaperTextInput>;
type PaperSearchbarProps = React.ComponentProps<typeof PaperSearchbar>;

/** Paper Text + RN TextProps — numberOfLines, onPress, selectable vb. geri döner. */
export type TextProps = PaperTextProps & RNTextProps;

/** Paper TextInput + RN TextInputProps — keyboardType, maxLength, autoCapitalize vb. geri döner. */
export type TextInputProps = PaperTextInputProps & RNTextInputProps;

/** Paper Searchbar + RN TextInputProps — onSubmitEditing, keyboardType vb. */
export type SearchbarProps = PaperSearchbarProps & Partial<RNTextInputProps>;

export const Text = PaperText as unknown as React.ComponentType<TextProps>;
export const TextInput = PaperTextInput as unknown as React.ComponentType<TextInputProps> & {
  Icon: typeof PaperTextInput.Icon;
  Affix: typeof PaperTextInput.Affix;
};
export const Searchbar = PaperSearchbar as unknown as React.ComponentType<SearchbarProps>;

// Paper TextInput'un compound alt bileşenlerini de koruyoruz
(TextInput as any).Icon = PaperTextInput.Icon;
(TextInput as any).Affix = PaperTextInput.Affix;

/**
 * Paper Card.Cover için tip uyumlu wrapper. Paper'ın tip tanımı `source` ve
 * diğer RN Image prop'larını açığa çıkarmıyor; bu wrapper RN ImageProps'u yansıtır.
 */
export type CardCoverProps = Omit<RNImageProps, 'source'> & {
  source?: { uri?: string } | number;
  index?: number;
  total?: number;
  style?: StyleProp<ViewStyle>;
  theme?: any;
};
export const CardCover = PaperCard.Cover as unknown as React.ComponentType<CardCoverProps>;
