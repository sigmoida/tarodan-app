import React from 'react';
import { View, ScrollView, Image, Pressable, Dimensions, StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;
const { width } = Dimensions.get('window');

/** Yatay sayfalı görsel galerisi + sayfa göstergeleri. Görsele dokununca viewer açılır. */
export function ProductGallery({
  images,
  currentImage,
  onPageChange,
  onOpenViewer,
}: {
  images: any[];
  currentImage: number;
  onPageChange: (page: number) => void;
  onOpenViewer: (index: number) => void;
}) {
  return (
    <>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => onPageChange(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={16}
      >
        {images.map((img: any, index: number) => {
          const uri = typeof img === 'string' ? img : img.url;
          return (
            <Pressable
              key={index}
              onPress={() => onOpenViewer(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel="Fotoğrafı büyüt"
            >
              <Image source={{ uri }} style={styles.productImage} resizeMode="contain" />
            </Pressable>
          );
        })}
      </ScrollView>

      {images.length > 1 && (
        <View style={styles.imageIndicators}>
          {images.map((_: any, index: number) => (
            <View key={index} style={[styles.indicator, currentImage === index && styles.indicatorActive]} />
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  productImage: { width, height: width, backgroundColor: colors.gray[50] },
  imageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border.DEFAULT,
    marginHorizontal: 4,
  },
  indicatorActive: { backgroundColor: colors.primary[600]!, width: 24 },
});
