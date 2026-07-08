import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { theme, Text } from '@tarodan/ui-native';

const { colors } = theme;

// Splash gradyan tonları. Üst/orta turuncular logodan (assets/tarodan-logo.jpg)
// örneklendi — semantic token DEĞİL. Orta ton, native splash backgroundColor
// (#FE6F13, app.json) ile BİREBİR aynı olmak zorunda: logonun kendi turuncu
// zemini gradyana dikişsiz otursun ve native→JS geçişinde parlama olmasın.
// Alt ton marka token'ı (primary[600]). Sampled değerler token'lanamadığı için
// hex yasağı bu iki satırda bilinçli devre dışı.
// eslint-disable-next-line no-restricted-syntax -- logodan örneklenen splash üst tonu
const SPLASH_TOP = '#FE7815';
// eslint-disable-next-line no-restricted-syntax -- native splash bg ile birebir (dikişsizlik)
const SPLASH_MID = '#FE6F13';
const SPLASH_GRADIENT = [SPLASH_TOP, SPLASH_MID, colors.primary[600]!] as const;
const SPLASH_GRADIENT_LOCATIONS = [0, 0.5, 1] as const;

// tarodan-logo.png oranı: 2788 x 688 ≈ 4.05:1
const LOGO_ASPECT = 2788 / 688;
const LOGO_WIDTH_RATIO = 0.72;

// Animasyon en az bu kadar süre görünür (token hızlı yüklense bile kesilmez).
const MIN_VISIBLE_MS = 1500;

const logoSource = require('../../assets/tarodan-logo.png');

interface AnimatedSplashProps {
  /** Uygulama hazır olduğunda (token yüklendi vb.) true olur. */
  appReady: boolean;
  /** Çıkış animasyonu bittiğinde overlay'i kaldırmak için çağrılır. */
  onFinish: () => void;
}

/** Üç beyaz noktadan biri — kademeli (staggered) pulse animasyonu. */
function LoadingDot({ delay }: { delay: number }) {
  const progress = useSharedValue(0.3);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 450, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 450, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.7 + progress.value * 0.5 }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

export default function AnimatedSplash({ appReady, onFinish }: AnimatedSplashProps) {
  const { width } = useWindowDimensions();
  const logoWidth = width * LOGO_WIDTH_RATIO;
  const logoHeight = logoWidth / LOGO_ASPECT;

  const rootOpacity = useSharedValue(1);
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const taglineOpacity = useSharedValue(0);
  const taglineY = useSharedValue(12);

  const [minElapsed, setMinElapsed] = useState(false);
  const splashHidden = useRef(false);
  const exiting = useRef(false);
  const finished = useRef(false);

  const finishOnce = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);

  // Giriş animasyonu (mount'ta bir kez).
  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSequence(
      withTiming(1.04, { duration: 480, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 160, easing: Easing.inOut(Easing.ease) }),
    );
    taglineOpacity.value = withDelay(250, withTiming(1, { duration: 450 }));
    taglineY.value = withDelay(250, withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) }));

    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [logoOpacity, logoScale, taglineOpacity, taglineY]);

  // Hazır + minimum süre dolduğunda çıkışa geç (bir kez).
  useEffect(() => {
    if (!appReady || !minElapsed || exiting.current) return;
    exiting.current = true;
    logoScale.value = withTiming(1.05, { duration: 350, easing: Easing.in(Easing.cubic) });
    rootOpacity.value = withTiming(
      0,
      { duration: 350, easing: Easing.in(Easing.cubic) },
      () => {
        runOnJS(finishOnce)();
      },
    );
  }, [appReady, minElapsed, logoScale, rootOpacity, finishOnce]);

  // Güvenlik ağı: appReady/animasyon ne olursa olsun splash en geç bu süre sonra kapanır.
  useEffect(() => {
    const t = setTimeout(() => {
      rootOpacity.value = 0;
      finishOnce();
    }, 8000);
    return () => clearTimeout(t);
  }, [rootOpacity, finishOnce]);

  // Overlay boyandıktan sonra native splash'i kapat → beyaz parlama yok.
  const handleLayout = (_e: LayoutChangeEvent) => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {
      /* zaten gizlenmiş olabilir */
    });
  };

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineY.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, rootStyle]} onLayout={handleLayout}>
      <StatusBar style="light" />
      <LinearGradient
        colors={SPLASH_GRADIENT}
        locations={SPLASH_GRADIENT_LOCATIONS}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.content}>
          <Animated.View style={logoStyle}>
            <Image
              source={logoSource}
              style={{ width: logoWidth, height: logoHeight }}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View style={taglineStyle}>
            <Text style={styles.tagline}>İkinci elin güvenli adresi</Text>
          </Animated.View>
        </View>

        <View style={styles.dots}>
          <LoadingDot delay={0} />
          <LoadingDot delay={150} />
          <LoadingDot delay={300} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    marginTop: theme.spacing[6],
    color: colors.overlay.white85,
    fontSize: theme.typography.fontSize.base,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: theme.spacing[16],
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
});
