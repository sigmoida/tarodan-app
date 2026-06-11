import { Dimensions, Image, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/**
 * Tam ekran görüntüleyici sayfası: pinch + double-tap zoom, zoom'luyken pan.
 * Native ScrollView zoom'u Android'de çalışmadığı için gesture-handler/reanimated ile
 * iki platformda da aynı davranır. Zoom'luyken dış yatay sayfalama kaymasın diye
 * onZoomChange ile üst bileşene haber verir.
 */
export default function ZoomableImage({
  uri,
  zoomed,
  onZoomChange,
}: {
  uri: string;
  zoomed: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd((e) => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(onZoomChange)(false);
      } else {
        const s = DOUBLE_TAP_SCALE;
        // Dokunulan nokta merkezde kalacak şekilde kaydır; görsel sınırları içinde tut
        const maxTx = (width * (s - 1)) / 2;
        const maxTy = (width * (s - 1)) / 2; // görsel width x width boyutunda
        const nextTx = clamp((width / 2 - e.x) * (s - 1), -maxTx, maxTx);
        const nextTy = clamp((height / 2 - e.y) * (s - 1), -maxTy, maxTy);
        scale.value = withTiming(s);
        tx.value = withTiming(nextTx);
        ty.value = withTiming(nextTy);
        savedScale.value = s;
        savedTx.value = nextTx;
        savedTy.value = nextTy;
        runOnJS(onZoomChange)(true);
      }
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, 1, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      const maxTx = (width * (scale.value - 1)) / 2;
      const maxTy = (width * (scale.value - 1)) / 2;
      tx.value = clamp(tx.value, -maxTx, maxTx);
      ty.value = clamp(ty.value, -maxTy, maxTy);
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(onZoomChange)(scale.value > 1);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      const maxTx = (width * (scale.value - 1)) / 2;
      const maxTy = (width * (scale.value - 1)) / 2;
      tx.value = clamp(savedTx.value + e.translationX, -maxTx, maxTx);
      ty.value = clamp(savedTy.value + e.translationY, -maxTy, maxTy);
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={styles.page}>
        <Animated.View style={animatedStyle}>
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width,
    height: width,
  },
});
