import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { theme } from '../lib/theme';

export type ScreenBackground = 'default' | 'alt' | 'elevated';

export interface ScreenProps {
  children: React.ReactNode;
  /** Page background — semantic surface token. */
  bg?: ScreenBackground;
  /** Wrap children in a ScrollView. Default: true. */
  scroll?: boolean;
  /** Wrap in KeyboardAvoidingView. Default: true. */
  keyboardAware?: boolean;
  /** Horizontal+vertical padding via spacing token (number = px). Default: spacing[6] horizontal, spacing[4] vertical. */
  padding?: keyof typeof theme.spacing | number | false;
  /** Center contents vertically. Useful for auth/login. */
  center?: boolean;
  contentContainerStyle?: ViewStyle;
  style?: ViewStyle;
  testID?: string;
}

const { colors, spacing } = theme;

const bgColor = (bg: ScreenBackground): string => {
  switch (bg) {
    case 'default':
      return colors.surface.DEFAULT;
    case 'alt':
      return colors.surface.alt;
    case 'elevated':
      return colors.surface.elevated;
  }
};

const resolvePad = (p: ScreenProps['padding']): number => {
  if (p === false) return 0;
  if (p == null) return spacing[6];
  if (typeof p === 'number') return p;
  return theme.spacing[p];
};

export const Screen: React.FC<ScreenProps> = ({
  children,
  bg = 'default',
  scroll = true,
  keyboardAware = true,
  padding,
  center,
  contentContainerStyle,
  style,
  testID,
}) => {
  const backgroundColor = bgColor(bg);
  const pad = resolvePad(padding);

  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[
        center ? styles.scrollCenter : styles.scrollDefault,
        { padding: pad },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        center ? styles.viewCenter : styles.viewDefault,
        { padding: pad },
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  const body = keyboardAware ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor }, style]}
      testID={testID}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    <View style={[styles.fill, { backgroundColor }, style]} testID={testID}>
      {inner}
    </View>
  );

  return body;
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollDefault: { flexGrow: 1 },
  scrollCenter: { flexGrow: 1, justifyContent: 'center' },
  viewDefault: { flex: 1 },
  viewCenter: { flex: 1, justifyContent: 'center' },
});
