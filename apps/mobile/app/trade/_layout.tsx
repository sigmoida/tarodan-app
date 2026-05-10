import { Stack } from 'expo-router';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

export default function TradeLayout() {
  // headerShown TRUE: trade ekranlarının çoğu Stack.Screen options ile title
  // veriyor ama header'ın kendisi gizliydi → geri butonu yoktu, kullanıcı
  // ekrandan çıkamıyordu. Native header geri butonuyla beraber gelir.
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.primary[600]! },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: colors.surface.DEFAULT },
      }}
    />
  );
}
