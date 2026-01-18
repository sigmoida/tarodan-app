import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../src/stores/authStore';
import { registerForPushNotifications } from '../src/services/push';
import { TarodanLightTheme, TarodanDarkTheme } from '../src/theme';

// Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

// Prevent splash screen from hiding
SplashScreen.preventAutoHideAsync();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? TarodanDarkTheme : TarodanLightTheme;
  const { loadToken, isAuthenticated } = useAuthStore();

  useEffect(() => {
    async function prepare() {
      try {
        await loadToken();
        if (isAuthenticated) {
          await registerForPushNotifications();
        }
      } catch (e) {
        console.warn(e);
      } finally {
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="product/[id]" options={{ title: 'Ürün Detay' }} />
          <Stack.Screen name="collection/[id]" options={{ title: 'Koleksiyon' }} />
          <Stack.Screen name="trade/[id]" options={{ title: 'Takas Detay' }} />
          <Stack.Screen name="messages/[id]" options={{ title: 'Mesajlar' }} />
        </Stack>
      </PaperProvider>
    </QueryClientProvider>
  );
}
