import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/stores/authStore';
import { registerForPushNotifications } from './src/services/push';
import { linking } from './src/navigation/linking';

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

// Conditionally configure notifications - only in development builds, not Expo Go
const isExpoGo = Constants.executionEnvironment === 'storeClient';
if (!isExpoGo) {
  try {
    const Notifications = require('expo-notifications');
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

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const { loadStoredAuth } = useAuthStore();

  useEffect(() => {
    async function prepare() {
      try {
        // Load stored authentication
        await loadStoredAuth();
        
        // Register for push notifications (only in development builds, not Expo Go)
        if (!isExpoGo) {
          try {
            await registerForPushNotifications();
          } catch (e) {
            console.log('⚠️ Push notification registration skipped (normal in Expo Go)');
          }
        }
      } catch (e) {
        console.warn('App init error:', e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <StatusBar style="light" />
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
