import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { theme } from './theme';

export interface CardProps extends ViewProps {
  variant?: 'default' | 'bordered' | 'elevated';
  padding?: keyof typeof theme.spacing;
}

const { colors, radius, spacing } = theme;

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 4,
  style,
  children,
  ...rest
}) => {
  return (
    <View
      style={[
        styles.base,
        variant === 'bordered' && styles.bordered,
        variant === 'elevated' && styles.elevated,
        { padding: spacing[padding] },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  elevated: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
});
