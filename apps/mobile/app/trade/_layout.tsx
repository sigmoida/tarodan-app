import { Stack } from 'expo-router';
import { TarodanColors } from '../../src/theme';

export default function TradeLayout() {
  // headerShown TRUE: trade ekranlarının çoğu Stack.Screen options ile title
  // veriyor ama header'ın kendisi gizliydi → geri butonu yoktu, kullanıcı
  // ekrandan çıkamıyordu. Native header geri butonuyla beraber gelir.
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: TarodanColors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: TarodanColors.background },
      }}
    />
  );
}
