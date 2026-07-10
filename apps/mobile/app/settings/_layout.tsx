import { Stack } from 'expo-router';
import { theme } from '@tarodan/ui-native';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.gray[50] },
      }}
    />
  );
}
