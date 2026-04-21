/**
 * Mobile Button — thin wrapper around @tarodan/ui-native Button.
 *
 * Preserves the legacy API (`title`, `onPress`, `loading`, `size: 'small'|'medium'|'large'`,
 * `icon: string`, `iconPosition`) so existing screens keep working while the brand colour
 * and visual language come from the shared design tokens.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Button as UIButton, type ButtonProps as UIButtonProps } from '@tarodan/ui-native';
import type { ViewStyle, TextStyle } from 'react-native';

type LegacySize = 'small' | 'medium' | 'large';

export interface MobileButtonProps {
  title: string;
  onPress: () => void;
  variant?: UIButtonProps['variant'];
  size?: LegacySize;
  icon?: string;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const sizeMap: Record<LegacySize, UIButtonProps['size']> = {
  small: 'sm',
  medium: 'md',
  large: 'lg',
};

const MobileButton: React.FC<MobileButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  loading,
  disabled,
  fullWidth,
  style,
  textStyle,
}) => {
  const iconSize = size === 'small' ? 16 : size === 'medium' ? 18 : 20;
  const iconColor =
    variant === 'primary' || variant === 'danger' || variant === 'success' || variant === 'secondary'
      ? '#FFF'
      : '#EA580C';
  const iconNode = icon ? (
    <Ionicons name={icon as never} size={iconSize} color={iconColor} />
  ) : undefined;

  return (
    <UIButton
      title={title}
      onPress={onPress}
      variant={variant}
      size={sizeMap[size]}
      isLoading={loading}
      disabled={disabled}
      fullWidth={fullWidth}
      leftIcon={iconPosition === 'left' ? iconNode : undefined}
      rightIcon={iconPosition === 'right' ? iconNode : undefined}
      style={style}
      textStyle={textStyle}
    />
  );
};

export default MobileButton;
