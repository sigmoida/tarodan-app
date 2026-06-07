import { Stack } from 'expo-router';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

export default function MessagesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.DEFAULT },
      }}
    />
  );
}
