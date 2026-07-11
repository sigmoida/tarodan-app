import { View } from 'react-native';
import { Button, Spinner, Snackbar, Text, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';

import { styles } from './_lib/styles';
import { useSubscription } from './_hooks/useSubscription';
import { SubscriptionBody } from './_components/SubscriptionBody';

/**
 * Subscription settings — THIN screen. The `useSubscription` controller owns the
 * subscription-store bindings, cancel/reactivate handlers, and derived status;
 * this file renders the auth gate, loading state, body, and snackbar.
 */
export default function SubscriptionSettingsScreen() {
  const f = useSubscription();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h3">Giriş Yapın</Text>
        <Text variant="body" style={styles.subtitle}>Abonelik ayarlarınızı görmek için giriş yapın</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={f.t('mobile.settingsSubscription')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {f.isLoading && !f.subscription ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : (
        <SubscriptionBody f={f} />
      )}

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ ...f.snackbar, visible: false })}
        duration={3000}
        variant={f.snackbar.variant ?? 'default'}
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
