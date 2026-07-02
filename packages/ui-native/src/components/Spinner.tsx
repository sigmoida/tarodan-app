import React from 'react';
import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { theme } from '../lib/theme';

export interface SpinnerProps extends Omit<ActivityIndicatorProps, 'color' | 'size'> {
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 'small', md: 'small', lg: 'large' } as const;

export const Spinner: React.FC<SpinnerProps> = ({ color, size = 'md', ...rest }) => {
  return (
    <ActivityIndicator
      color={color ?? theme.colors.primary[600]!}
      size={sizeMap[size]}
      {...rest}
    />
  );
};
