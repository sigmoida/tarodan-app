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
  const [failed, setFailed] = React.useState(false);

  // Boş/whitespace string'i "kaynak yok" say — yoksa <Image> baş harf yerine
  // boş daire bırakır (örn. çözülememiş/çıplak key).
  const src =
    typeof source === 'string'
      ? source.trim()
        ? { uri: source.trim() }
        : undefined
      : (source as ImageSourcePropType | undefined);

  // Kaynak değişince hata bayrağını sıfırla ki yeni URL tekrar denensin.
  const srcKey = typeof source === 'string' ? source : JSON.stringify(source ?? null);
  React.useEffect(() => {
    setFailed(false);
  }, [srcKey]);

  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  // src yoksa veya yükleme başarısızsa (expired presigned URL / 403 / ağ) baş harfe düş.
  const showImage = !!src && !failed;

  return (
    <View
      style={[
        styles.base,
        { width: s, height: s, borderRadius: s / 2 },
      ]}
    >
      {showImage ? (
        <Image
          source={src}
          style={{ width: s, height: s, borderRadius: s / 2 }}
          onError={() => setFailed(true)}
        />
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
