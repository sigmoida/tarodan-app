import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { theme } from '@tarodan/ui-native';
import { api } from './api';
import { toMobileRoute } from '../utils/notificationRoute';

const { colors } = theme;

// Conditionally import notifications - only in development builds, not Expo Go
let Notifications: any = null;
const isExpoGo = Constants.executionEnvironment === 'storeClient';

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    // Uygulama ön planda (açık) iken gelen bildirimin nasıl sunulacağı.
    // Bu olmadan Expo, foreground bildirimini varsayılan olarak göstermez.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.log('⚠️ expo-notifications not available');
  }
}

/**
 * EAS projectId çözümü. `eas init` değeri app.json → extra.eas.projectId'ye
 * yazar; lokalde EXPO_PUBLIC_PROJECT_ID env ile override edilebilir. Placeholder
 * ("REPLACE_WITH_...") geçersiz sayılır. projectId yoksa Expo push token alınamaz.
 */
function resolveProjectId(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_PROJECT_ID;
  const fromConfig = (Constants.expoConfig?.extra as any)?.eas?.projectId;
  const id = fromEnv || fromConfig;
  if (!id || typeof id !== 'string' || id.startsWith('REPLACE_WITH')) {
    return null;
  }
  return id;
}

export async function registerForPushNotifications(): Promise<string | null> {
  // Skip in Expo Go - push notifications not supported
  if (isExpoGo || !Notifications) {
    console.log('⚠️ Push notifications not available in Expo Go');
    return null;
  }

  let token: string | null = null;

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }
  } catch (e) {
    console.log('⚠️ Push notification permissions unavailable');
    return null;
  }

  // Get Expo push token
  try {
    // Skip push token in Expo Go (development) - it requires projectId
    // Push notifications will work in production builds with EAS
    const projectId = resolveProjectId();

    if (!projectId) {
      console.log('⚠️ Push notifications skipped (no projectId - normal in Expo Go)');
      return null;
    }
    
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = tokenResponse.data;

    // Register token with backend (POST /notifications/push-token)
    await api.post('/notifications/push-token', {
      token,
      platform: Platform.OS,
      deviceId: Device.modelName ?? 'unknown',
    }).catch((err: any) => {
      console.log('Failed to register push token with backend:', err.message);
    });

    console.log('Push token registered:', token);
  } catch (error: any) {
    // Don't show error in development - this is expected in Expo Go
    console.log('⚠️ Push notifications unavailable:', error.message);
  }

  // Configure notification channel for Android
  if (Platform.OS === 'android' && Notifications) {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Varsayılan',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.danger[500],
      });

      await Notifications.setNotificationChannelAsync('trades', {
        name: 'Takaslar',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.success[500],
      });

      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Mesajlar',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.info[500],
      });

      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Siparişler',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.warning[500],
      });
    } catch (e) {
      console.log('⚠️ Notification channel setup failed');
    }
  }

  return token;
}

export async function unregisterPushNotifications(): Promise<void> {
  if (isExpoGo || !Notifications) {
    return;
  }
  try {
    const projectId = resolveProjectId();
    if (!projectId) {
      return;
    }
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    // Aynı endpoint'e revoke:true ile gidiyoruz; backend bu token'ı
    // push_tokens tablosunda isActive=false yapar (notification.service.ts).
    await api.post('/notifications/push-token', {
      token: tokenResponse.data,
      revoke: true,
    }).catch(() => null);
  } catch (error) {
    console.error('Error unregistering push token:', error);
  }
}

export function addNotificationReceivedListener(
  callback: (notification: any) => void
): any {
  if (isExpoGo || !Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseReceivedListener(
  callback: (response: any) => void
): any {
  if (isExpoGo || !Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Resolve a push payload (`notification.request.content.data`) into a route
 * and navigate via Expo Router. Backend persists `notification.link` (e.g.
 * `/products/unavailable/<id>`); we honor that first, then fall back to the
 * known `type` enum so missing-link payloads still route correctly.
 */
export function routeFromNotification(data: any): void {
  try {
    if (data?.link && typeof data.link === 'string') {
      // Backend link'leri WEB rotaları için interpole edilir (ör.
      // /messages?thread=<id>). Mobilde geçerli rotaya çevir; aksi halde
      // /messages?thread=<id> gibi linkler boş ekran açıyordu. Eşleşme yoksa
      // data.type tabanlı fallback'e düş.
      const mobileRoute = toMobileRoute(data.link);
      if (mobileRoute) {
        router.push(mobileRoute as any);
        return;
      }
    }
    switch (data?.type) {
      case 'order_cancelled_out_of_stock':
      case 'offer_cancelled_out_of_stock':
      case 'back_in_stock': {
        const productId = data?.productId ?? data?.product_id;
        if (productId) {
          router.push(`/products/unavailable/${productId}` as any);
        } else {
          router.push('/(tabs)/notifications' as any);
        }
        return;
      }
      case 'order_reservation_released':
      case 'order_cancelled': {
        const orderId = data?.orderId ?? data?.order_id;
        if (orderId) {
          router.push(`/orders/${orderId}` as any);
        } else {
          router.push('/orders' as any);
        }
        return;
      }
      default:
        break;
    }

    // Genel id-tabanlı fallback — backend push payload'unda link/type tam
    // olmasa bile orderId/tradeId/offerId/threadId/productId/collectionId/userId
    // gönderiyor. app/(tabs)/notifications.tsx routeForNotification ile aynı sıra.
    const idRoute = routeFromData(data);
    if (idRoute) {
      router.push(idRoute as any);
      return;
    }

    router.push('/(tabs)/notifications' as any);
  } catch (err) {
    console.log('routeFromNotification failed:', (err as any)?.message);
  }
}

/**
 * data içindeki ilgili-varlık id'lerinden mobil rota türetir. Eşleştirme sırası
 * ve hedefler app/(tabs)/notifications.tsx içindeki routeForNotification ile bire
 * bir aynı tutulmalı (push tap ile in-app tap aynı yere gitsin).
 */
function routeFromData(data: any): string | null {
  if (!data) return null;
  const orderId = data.orderId ?? data.order_id;
  const tradeId = data.tradeId ?? data.trade_id;
  const offerId = data.offerId ?? data.offer_id;
  const threadId = data.threadId ?? data.thread_id;
  const productId = data.productId ?? data.product_id;
  const collectionId = data.collectionId ?? data.collection_id;
  const userId = data.userId ?? data.user_id;
  if (orderId) return `/orders/${orderId}`;
  if (tradeId) return `/trade/${tradeId}`;
  if (offerId) return `/offers/${offerId}`;
  if (threadId) return `/messages/${threadId}`;
  if (productId) return `/product/${productId}`;
  if (collectionId) return `/collections/${collectionId}`;
  if (userId) return `/seller/${userId}`;
  return null;
}

/**
 * Wires Expo notification listeners (tap + foreground-received) to the
 * deep-link router above. Returns a teardown that removes both listeners.
 * Safe to call in Expo Go (no-op).
 */
export function setupPushNotificationRouting(): () => void {
  if (isExpoGo || !Notifications) {
    return () => {};
  }

  // 1) User taps an OS-level notification
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response: any) => {
      const data = response?.notification?.request?.content?.data;
      routeFromNotification(data);
    },
  );

  // 2) Notification arrives while app is foregrounded — handle any pre-resolved
  //    "auto-open" flag (data.autoOpen === true). Otherwise let the user tap.
  const receivedSub = Notifications.addNotificationReceivedListener(
    (notification: any) => {
      const data = notification?.request?.content?.data;
      if (data?.autoOpen === true || data?.auto_open === true) {
        routeFromNotification(data);
      }
    },
  );

  // 3) Cold-start: uygulama KAPALIYKEN bildirime basılıp açıldıysa, yanıt live
  // listener'a düşmez → son yanıtı bir kez oku ve yönlendir.
  Notifications.getLastNotificationResponseAsync()
    .then((response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (data) routeFromNotification(data);
    })
    .catch(() => { /* sessiz */ });

  return () => {
    try {
      responseSub?.remove?.();
      receivedSub?.remove?.();
    } catch {
      /* noop */
    }
  };
}
