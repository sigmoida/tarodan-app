import { Stack } from 'expo-router';

export default function ModelsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[slug]/index" />
    </Stack>
  );
}
