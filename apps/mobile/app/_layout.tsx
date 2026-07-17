import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import { theme, AlertDialogHost } from "@tarodan/ui-native";
import { useAuthStore } from "@/stores/authStore";
import { useMessagingSocket } from "@/hooks/messaging";
// Paylaşılan QueryClient — logout'ta resetUserStores aynı örneği temizler.
import { queryClient } from "@/lib/queryClient";
import {
  registerForPushNotifications,
  setupPushNotificationRouting,
} from "@/services/push";
import { LanguageProvider } from "@/i18n";
import { initSentry } from "@/services/sentry";
import AnimatedSplash from "@/components/AnimatedSplash";
import BusinessMembershipGuard from "@/components/BusinessMembershipGuard";
import ForceUpdateGate from "@/components/ForceUpdateGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const { colors } = theme;

// Initialize Sentry as early as possible. No-ops in Expo Go or when
// EXPO_PUBLIC_SENTRY_DSN is unset (see services/sentry.ts guard); real
// reporting requires a dev/production build with a DSN configured.
initSentry();

// Conditionally import notifications - only in development builds, not Expo Go
let Notifications: any = null;
const isExpoGo = Constants.executionEnvironment === "storeClient";

if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
  } catch (e) {
    console.log("⚠️ expo-notifications not available");
  }
}

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
    console.log("⚠️ Notification handler setup failed (normal in Expo Go)");
  }
}

/** QueryClientProvider'ın altında çalışması gereken global mesaj socket köprüsü (#77). */
function MessagingSocketBridge() {
  useMessagingSocket();
  return null;
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
            console.log(
              "⚠️ Push notification registration skipped (normal in Expo Go)",
            );
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

  // Token kaydını isAuthenticated değişimine de bağla: kullanıcı uygulamayı
  // çıkışlı açıp SONRA login olursa (isAuthenticated mount'tan sonra true olur),
  // yukarıdaki []-bağımlı prepare() tekrar çalışmaz ve token hiç kaydolmazdı.
  // registerToken upsert olduğu için açılışta + login'de çift çağrı zararsız.
  useEffect(() => {
    if (isAuthenticated && !isExpoGo) {
      registerForPushNotifications().catch(() => {});
    }
  }, [isAuthenticated]);

  // Global mesaj socket köprüsü (#77) QueryClientProvider'ın ALTINDA çalışmalı
  // (useQueryClient) → <MessagingSocketBridge/> olarak provider içinde render edilir.

  // Wire push notification deep-link routing (tap + foreground-received).
  // Safe in Expo Go (no-op when expo-notifications isn't available).
  useEffect(() => {
    const teardown = setupPushNotificationRouting();
    return () => {
      teardown();
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.primary[600]! },
              headerTintColor: colors.white,
              headerTitleStyle: { fontWeight: "bold" },
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack>
          {/* Global mesaj socket köprüsü (#77) — provider altında setQueryData için. */}
          <MessagingSocketBridge />
          {/* Kurumsal hesap business üyelik yoksa üyelik sayfasına yönlendirir (web ile aynı). */}
          <BusinessMembershipGuard />
          {/* Native Alert.alert yerine temalı dialog — appAlert() bu host'u kullanır. */}
          <AlertDialogHost />
          {/* Min desteklenen sürümün altındaki build'leri tam ekran bloklar (#233). */}
          <ForceUpdateGate />
          {!splashDone && (
            <AnimatedSplash
              appReady={appReady}
              onFinish={() => setSplashDone(true)}
            />
          )}
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
