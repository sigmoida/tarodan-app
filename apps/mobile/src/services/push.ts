import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

export async function registerForPushNotifications(): Promise<string | null> {
  let token: string | null = null;

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

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

  // Get Expo push token
  try {
    // Skip push token in Expo Go (development) - it requires projectId
    // Push notifications will work in production builds with EAS
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    
    if (!projectId) {
      console.log('⚠️ Push notifications skipped (no projectId - normal in Expo Go)');
      return null;
    }
    
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = tokenResponse.data;

    // Register token with backend
    await api.post('/notifications/register-device', {
      token,
      platform: Platform.OS,
      deviceName: Device.modelName,
    }).catch((err) => {
      console.log('Failed to register push token with backend:', err.message);
    });

    console.log('Push token registered:', token);
  } catch (error: any) {
    // Don't show error in development - this is expected in Expo Go
    console.log('⚠️ Push notifications unavailable:', error.message);
  }

  // Configure notification channel for Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Varsayılan',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E53935',
    });

    await Notifications.setNotificationChannelAsync('trades', {
      name: 'Takaslar',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4CAF50',
    });

    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Mesajlar',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2196F3',
    });

    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Siparişler',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF9800',
    });
  }

  return token;
}

export async function unregisterPushNotifications(): Promise<void> {
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    await api.delete('/notifications/register-device', {
      data: { token: tokenResponse.data },
    });
  } catch (error) {
    console.error('Error unregistering push token:', error);
  }
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
