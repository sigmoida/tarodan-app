import { Stack } from 'expo-router';
import { TarodanColors } from '../../src/theme';

export default function MessagesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: TarodanColors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[threadId]" />
      <Stack.Screen name="new" />
    </Stack>
  );
}
