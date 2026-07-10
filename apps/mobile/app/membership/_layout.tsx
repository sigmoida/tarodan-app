import { Stack } from 'expo-router';
import { theme } from '@tarodan/ui-native';

export default function MembershipLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: theme.colors.white,
        },
      }}
    />
  );
}
