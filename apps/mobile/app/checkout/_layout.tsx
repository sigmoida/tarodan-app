import { Stack } from 'expo-router';
import { TarodanColors } from '../../src/theme';

export default function CheckoutLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: TarodanColors.background,
        },
      }}
    />
  );
}
