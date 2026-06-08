import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { theme } from '@tarodan/ui-native';
import { useAuthStore } from '../src/stores/authStore';
import { registerForPushNotifications, setupPushNotificationRouting } from '../src/services/push';
import { LanguageProvider } from '../src/i18n';
import { initSentry } from '../src/services/sentry';
import AnimatedSplash from '../src/components/AnimatedSplash';
import BusinessMembershipGuard from '../src/components/BusinessMembershipGuard';

const { colors } = theme;

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
  const { loadToken, isAuthenticated } = useAuthStore();
  // appReady: hazırlık bitti. splashDone: animasyonlu splash çıkışını tamamladı.
  // Native splash'i AnimatedSplash kapatır (onLayout) → beyaz parlama olmaz.
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

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
        setAppReady(true);
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
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary[600]! },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: 'bold' },
            headerShown: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack>
        {/* Kurumsal hesap business üyelik yoksa üyelik sayfasına yönlendirir (web ile aynı). */}
        <BusinessMembershipGuard />
        {!splashDone && (
          <AnimatedSplash appReady={appReady} onFinish={() => setSplashDone(true)} />
        )}
      </LanguageProvider>
    </QueryClientProvider>
  );
}
