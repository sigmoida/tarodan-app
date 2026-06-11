import { Stack } from 'expo-router';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

export default function TradeLayout() {
  // headerShown FALSE: her trade ekranı kendi in-app header'ını (ScreenHeader /
  // özel header) geri butonuyla birlikte render ediyor. Native header açık
  // kalırsa çift başlık + fazladan boşluk oluşuyordu (web'de tek header var).
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.DEFAULT },
      }}
    />
  );
}
