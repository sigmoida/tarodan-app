import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useAuthStore } from '../src/stores/authStore';
import { registerForPushNotifications, setupPushNotificationRouting } from '../src/services/push';
import { TarodanLightTheme, TarodanDarkTheme } from '../src/theme';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { initSentry } from '../src/services/sentry';

// Initialize Sentry as early as possible. Currently a stub (no-op until
// `@sentry/react-native` is installed and SENTRY_PACKAGE_LOADED is flipped
// to true in services/sentry.ts). Calling here ensures the wiring exists.
initSentry();

// Conditionally import notifications - only in development builds, not Expo Go
let Notifications: any = null;
const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.log('⚠️ expo-notifications not available');
  }
}

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

// Configure notifications (only in development builds, not Expo Go)
if (!isExpoGo && Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.log('⚠️ Notification handler setup failed (normal in Expo Go)');
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? TarodanDarkTheme : TarodanLightTheme;
  const { loadToken, isAuthenticated } = useAuthStore();

  useEffect(() => {
    async function prepare() {
      try {
        await loadToken();
        // Only register for push notifications in development builds, not Expo Go
        if (isAuthenticated && !isExpoGo) {
          try {
            await registerForPushNotifications();
          } catch (e) {
            console.log('⚠️ Push notification registration skipped (normal in Expo Go)');
          }
        }
      } catch (e) {
        console.warn(e);
      } finally {
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  // Wire push notification deep-link routing (tap + foreground-received).
  // Safe in Expo Go (no-op when expo-notifications isn't available).
  useEffect(() => {
    const teardown = setupPushNotificationRouting();
    return () => {
      teardown();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <PaperProvider theme={theme}>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.primary },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack>
        </PaperProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
