import { Stack } from 'expo-router';
import { TarodanColors } from '../../../src/theme';

export default function CollectionDetailLayout() {
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
        name="edit" 
        options={{ 
          title: 'Koleksiyonu Düzenle',
        }} 
      />
    </Stack>
  );
}
