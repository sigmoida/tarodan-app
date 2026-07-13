/**
 * AppImage — uzak görsellerin TEK render kapısı (#73).
 *
 * RN `<Image>` yerine `expo-image` kullanır:
 *   - `cachePolicy="memory-disk"` → görsel remount'ta yeniden indirilmez (RN
 *     <Image>'ın zayıf/tutarsız disk cache'i cihaz RAM'ini şişiriyordu).
 *   - hücre boyutuna göre downsample → küçük hücrede tam-res bitmap tutulmaz.
 *   - `variant` ile boyut-farkında URL çözümü: liste hücreleri `card`
 *     (thumbnail), galeri/detay `detail` (tam çözünürlük).
 *
 * Drop-in olması için `source` her şekli kabul eder (entity/obje/dizi/string);
 * `getImageUrl` ile aynı çözümleme. `resizeMode` → `contentFit` köprüsü var ki
 * mevcut çağrı yerleri tek satırda taşınabilsin.
 */
import React from 'react';
import { type StyleProp, type ImageStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { resolveImageUrl, IMAGE_PLACEHOLDER, type ImageVariant } from '@/utils/imageUrl';

export interface AppImageProps {
  /** Entity / görsel objesi / dizi / string — `getImageUrl` ile aynı çözümleme. */
  source: unknown;
  /** Küçük hücreler için `card` (thumbnail). Varsayılan `card`. Galeri/detay: `detail`. */
  variant?: ImageVariant;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** RN uyumluluk köprüsü — `contentFit` verilmezse buradan eşlenir. */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  accessibilityLabel?: string;
  onError?: () => void;
}

const RESIZE_TO_FIT: Record<NonNullable<AppImageProps['resizeMode']>, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
};

export const AppImage = React.memo(function AppImage({
  source,
  variant = 'card',
  style,
  contentFit,
  resizeMode,
  accessibilityLabel,
  onError,
}: AppImageProps) {
  const uri = resolveImageUrl(source, variant);
  const fit = contentFit ?? (resizeMode ? RESIZE_TO_FIT[resizeMode] : 'cover');

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={fit}
      cachePolicy="memory-disk"
      transition={150}
      placeholder={IMAGE_PLACEHOLDER}
      accessibilityLabel={accessibilityLabel}
      onError={onError}
    />
  );
});
