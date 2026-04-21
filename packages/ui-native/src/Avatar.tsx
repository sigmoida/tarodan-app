import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { theme } from './theme';

export interface AvatarProps {
  source?: ImageSourcePropType | string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const { colors, typography } = theme;
const sizeMap = { sm: 28, md: 40, lg: 56, xl: 80 } as const;

export const Avatar: React.FC<AvatarProps> = ({ source, name, size = 'md' }) => {
  const s = sizeMap[size];
  const src =
    typeof source === 'string' ? { uri: source } : (source as ImageSourcePropType | undefined);
  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <View
      style={[
        styles.base,
        { width: s, height: s, borderRadius: s / 2 },
      ]}
    >
      {src ? (
        <Image source={src} style={{ width: s, height: s, borderRadius: s / 2 }} />
      ) : (
        <Text style={[styles.initials, { fontSize: s * 0.4 }]}>{initials}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: colors.primary[700]!,
    fontWeight: '700',
    fontFamily: typography.fontFamily.sans[0],
  },
});
