import { Stack } from 'expo-router';
import { TarodanColors } from '../../src/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: TarodanColors.backgroundSecondary },
      }}
    >
      <Stack.Screen name="collections" />
      <Stack.Screen name="my-listings" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="wishlist" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="addresses" />
      <Stack.Screen name="membership" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="security" />
      <Stack.Screen name="help" />
      <Stack.Screen name="support" />
      <Stack.Screen name="about" />
    </Stack>
  );
}
