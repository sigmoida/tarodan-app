/**
 * Mobile Input — thin wrapper around @tarodan/ui-native Input.
 * Keeps the legacy `hint`, `leftIcon`/`rightIcon` (string-as-Ionicons-name) API.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, type ViewStyle, type TextInputProps } from 'react-native';
import { Input as UIInput, theme } from '@tarodan/ui-native';

interface MobileInputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
}

const MobileInput: React.FC<MobileInputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  ...rest
}) => {
  const left = leftIcon ? (
    <Ionicons name={leftIcon as never} size={20} color={theme.colors.text.muted} />
  ) : undefined;
  const right = rightIcon ? (
    onRightIconPress ? (
      <TouchableOpacity onPress={onRightIconPress} hitSlop={8}>
        <Ionicons name={rightIcon as never} size={20} color={theme.colors.text.muted} />
      </TouchableOpacity>
    ) : (
      <Ionicons name={rightIcon as never} size={20} color={theme.colors.text.muted} />
    )
  ) : undefined;

  return (
    <UIInput
      label={label}
      error={error}
      helperText={hint}
      leftIcon={left}
      rightIcon={right}
      containerStyle={containerStyle}
      {...rest}
    />
  );
};

export default MobileInput;
