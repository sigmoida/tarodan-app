import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';

export type SnackbarVariant = 'default' | 'success' | 'danger' | 'warning' | 'info';

export interface SnackbarProps {
  visible: boolean;
  onDismiss: () => void;
  /** Auto-dismiss after this many ms. 0 = never. Default 4000. */
  duration?: number;
  variant?: SnackbarVariant;
  action?: { label: string; onPress: () => void };
  children?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

const { colors, radius, spacing, typography } = theme;

const variantBg: Record<SnackbarVariant, string> = {
  default: colors.gray[900],
  success: colors.success[700]!,
  danger: colors.danger[700]!,
  warning: colors.warning[700]!,
  info: colors.info[700]!,
};

export const Snackbar: React.FC<SnackbarProps> = ({
  visible,
  onDismiss,
  duration = 4000,
  variant = 'default',
  action,
  children,
  style,
  testID,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      if (duration > 0) {
        const t = setTimeout(onDismiss, duration);
        return () => clearTimeout(t);
      }
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, duration, onDismiss, opacity, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { opacity, transform: [{ translateY }] }, style]}
      testID={testID}
    >
      <View style={[styles.bar, { backgroundColor: variantBg[variant] }]}>
        <Text style={styles.message}>{children}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={6}>
            <Text style={styles.actionLabel}>{action.label.toUpperCase()}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[6],
    alignItems: 'center',
  },
  bar: {
    minHeight: 48,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  message: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    flex: 1,
    marginRight: spacing[3],
  },
  actionLabel: {
    color: colors.primary[300]!,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
