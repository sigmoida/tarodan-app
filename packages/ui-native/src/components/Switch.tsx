import React from 'react';
import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from 'react-native';
import { theme } from '../lib/theme';

export interface SwitchProps
  extends Omit<RNSwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'> {
  value: boolean;
  onValueChange: (v: boolean) => void;
}

const { colors } = theme;

export const Switch: React.FC<SwitchProps> = ({ value, onValueChange, disabled, ...rest }) => (
  <RNSwitch
    value={value}
    onValueChange={onValueChange}
    disabled={disabled}
    trackColor={{ false: colors.gray[300], true: colors.primary[600]! }}
    thumbColor={colors.white}
    ios_backgroundColor={colors.gray[300]}
    {...rest}
  />
);
