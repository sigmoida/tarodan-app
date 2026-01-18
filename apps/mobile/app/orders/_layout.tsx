import { Stack } from 'expo-router';
import { TarodanColors } from '../../src/theme';

export default function OrdersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: TarodanColors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
