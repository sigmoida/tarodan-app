import React, { useState } from 'react';
import { Modal, ScrollView, Pressable, Dimensions, StyleSheet } from 'react-native';
import { theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ZoomableImage from '@/components/product/ZoomableImage';

const { colors } = theme;
const { width } = Dimensions.get('window');

/** Tam ekran görsel görüntüleyici — pinch + double-tap zoom (G1). */
export function ImageViewerModal({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: any[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => setZoomed(false)}
    >
      {/* Modal Android'de yeni native pencere açtığı için root view modal içinde olmalı */}
      <GestureHandlerRootView style={styles.viewerContainer}>
        <Pressable style={styles.viewerClose} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat">
          <Ionicons name="close" size={30} color={colors.white} />
        </Pressable>
        <ScrollView
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * width, y: 0 }}
        >
          {images.map((img: any, index: number) => {
            const uri = typeof img === 'string' ? img : img.url;
            return <ZoomableImage key={index} uri={uri} zoomed={zoomed} onZoomChange={setZoomed} />;
          })}
        </ScrollView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewerContainer: { flex: 1, backgroundColor: colors.black },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlay.black50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
