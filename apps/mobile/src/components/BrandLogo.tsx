import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

/**
 * Tarodan kelime-logosu (dairesel oklar + "TARODAN").
 * PNG şeffaf zeminli ve iki-tonludur: "TARO" beyaz, "DAN" koyu, oklar turuncu.
 * Beyaz "TARO" açık zeminde kaybolduğu için logo turuncu bir zemine yerleştirilmelidir
 * (auth ekranlarının arka planı turuncu). Tek kaynak: buradan boyut/styl güncellenir.
 */
export function BrandLogo({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require('../../assets/tarodan-logo.png')}
      style={[styles.logo, style]}
      resizeMode="contain"
      accessibilityLabel="Tarodan"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 240,
    height: 58,
  },
});

export default BrandLogo;
