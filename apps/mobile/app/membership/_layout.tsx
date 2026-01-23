import { Stack } from 'expo-router';
import { TarodanColors } from '../../src/theme';

export default function MembershipLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: TarodanColors.background,
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
