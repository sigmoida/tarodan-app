import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { theme, AlertDialogHost } from '@tarodan/ui-native';
import { useAuthStore } from '@/stores/authStore';
import { useMessagesStore } from '@/stores/messagesStore';
import { connectSocket, disconnectSocket } from '@/services/socket';
// Paylaşılan QueryClient — logout'ta resetUserStores aynı örneği temizler.
import { queryClient } from '@/lib/queryClient';
import { registerForPushNotifications, setupPushNotificationRouting } from '@/services/push';
import { LanguageProvider } from '@/i18n';
import { initSentry } from '@/services/sentry';
import AnimatedSplash from '@/components/AnimatedSplash';
import BusinessMembershipGuard from '@/components/BusinessMembershipGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
  const token = useAuthStore((s) => s.token);
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

  // Token kaydını isAuthenticated değişimine de bağla: kullanıcı uygulamayı
  // çıkışlı açıp SONRA login olursa (isAuthenticated mount'tan sonra true olur),
  // yukarıdaki []-bağımlı prepare() tekrar çalışmaz ve token hiç kaydolmazdı.
  // registerToken upsert olduğu için açılışta + login'de çift çağrı zararsız.
  useEffect(() => {
    if (isAuthenticated && !isExpoGo) {
      registerForPushNotifications().catch(() => {});
    }
  }, [isAuthenticated]);

  // Oturum açıkken socket bağlan + global mesaj dinleyicileri; kapanınca kopar.
  useEffect(() => {
    if (!token) { disconnectSocket(); return; }
    const socket = connectSocket(token);
    const onMessageNew = (p: { threadId: string; message: any }) =>
      useMessagesStore.getState().applyIncomingMessage(p.threadId, p.message);
    const onThreadUpdated = () => useMessagesStore.getState().fetchUnreadCount();
    // Karşı taraf mesajlarımı okudu → gönderen tarafta çift mavi çentik canlı dönsün.
    const onMessageRead = (p: { threadId: string; messageIds: string[] }) =>
      useMessagesStore.getState().applyMessagesRead(p.threadId, p.messageIds || []);
    const onReconnect = () => {
      const tid = useMessagesStore.getState().currentThreadId;
      if (tid) {
        socket.emit('join:thread', { threadId: tid });
        useMessagesStore.getState().fetchMessages(tid);
      }
      useMessagesStore.getState().fetchThreads();
    };
    socket.on('message:new', onMessageNew);
    socket.on('thread:updated', onThreadUpdated);
    socket.on('message:read', onMessageRead);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('thread:updated', onThreadUpdated);
      socket.off('message:read', onMessageRead);
      socket.io.off('reconnect', onReconnect);
    };
  }, [token]);

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
              headerTitleStyle: { fontWeight: 'bold' },
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack>
          {/* Kurumsal hesap business üyelik yoksa üyelik sayfasına yönlendirir (web ile aynı). */}
          <BusinessMembershipGuard />
          {/* Native Alert.alert yerine temalı dialog — appAlert() bu host'u kullanır. */}
          <AlertDialogHost />
          {!splashDone && (
            <AnimatedSplash appReady={appReady} onFinish={() => setSplashDone(true)} />
          )}
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
