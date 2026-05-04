/**
 * react-native-paper Text ve TextInput tipleri için module augmentation.
 *
 * Problem:
 *   Paper 5.14 + React 19 + TypeScript 5 kombinasyonunda `React.ComponentProps<typeof NativeText>`
 *   ve `React.ComponentPropsWithRef<typeof NativeTextInput>` kesişimleri
 *   `numberOfLines`, `keyboardType`, `autoCapitalize`, `maxLength`,
 *   `secureTextEntry`, `selectable` gibi RN prop'larını TS'e yansıtmıyor.
 *   Runtime'da prop'lar çalışıyor (Paper onları native'e forward ediyor)
 *   fakat typecheck strict modda hata veriyor.
 *
 * Çözüm:
 *   Paper'ın `Text` ve `TextInput` tiplerini RN `TextProps` / `TextInputProps`
 *   ile genişletiyoruz. Bu, projedeki tüm dosyaların tek bir import
 *   değişikliği yapmadan sorunu gidermesini sağlar.
 */

import type { TextInputProps as RNTextInputProps, TextProps as RNTextProps } from 'react-native';

declare module 'react-native-paper' {
  namespace Text {
    interface Props extends RNTextProps {}
  }
  namespace TextInput {
    interface Props extends RNTextInputProps {}
  }
}

// Paper Text ve TextInput zaten default export. Namespace birleştirme mümkün değil;
// bu nedenle aşağıdaki pattern Paper tiplerini ES2015 module augmentation ile genişletir.
declare module 'react-native-paper/lib/typescript/components/Typography/Text' {
  import type { TextProps as RNTextProps } from 'react-native';
  // Props<T> tipi zaten RN TextProps içermesi gereken `React.ComponentProps<typeof NativeText>` ile tanımlı
  // fakat TS intersection problem çıkardığı için açıkça genişletiyoruz.
  export type Props<T> = import('react-native').TextProps & {
    variant?: any;
    children: React.ReactNode;
    theme?: any;
    style?: import('react-native').StyleProp<import('react-native').TextStyle>;
  };
}

declare module 'react-native-paper/lib/typescript/components/TextInput/TextInput' {
  import type { TextInputProps as RNTextInputProps } from 'react-native';
  export type Props = RNTextInputProps & {
    mode?: 'flat' | 'outlined';
    left?: React.ReactNode;
    right?: React.ReactNode;
    disabled?: boolean;
    label?: any;
    placeholder?: string;
    error?: boolean;
    onChangeText?: (text: string) => void;
    selectionColor?: string;
    cursorColor?: string;
    underlineColor?: string;
    activeUnderlineColor?: string;
    outlineColor?: string;
    activeOutlineColor?: string;
    textColor?: string;
    dense?: boolean;
    multiline?: boolean;
    numberOfLines?: number;
    onFocus?: (args: any) => void;
    onBlur?: (args: any) => void;
    render?: (props: any) => React.ReactNode;
    value?: string;
    style?: import('react-native').StyleProp<import('react-native').TextStyle>;
    theme?: any;
    testID?: string;
    contentStyle?: import('react-native').StyleProp<import('react-native').TextStyle>;
    outlineStyle?: import('react-native').StyleProp<import('react-native').ViewStyle>;
    underlineStyle?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  };
}
