import { Stack } from 'expo-router';
import { TarodanColors } from '../../src/theme';

export default function TradeLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: TarodanColors.primary,
        },
        headerTintColor: TarodanColors.textOnPrimary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="new" 
        options={{ 
          title: 'Yeni Takas Teklifi',
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="[id]" 
        options={{ 
          title: 'Takas Detayı',
        }} 
      />
    </Stack>
  );
}
