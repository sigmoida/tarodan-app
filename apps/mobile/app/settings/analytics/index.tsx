import { View } from 'react-native';
import { Button, Spinner, Text, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { styles } from './_lib/styles';
import { useAnalytics } from './_hooks/useAnalytics';
import { AnalyticsContent } from './_components/AnalyticsContent';

const { colors } = theme;

/**
 * Seller analytics — THIN screen. The `useAnalytics` controller owns the query,
 * focus refresh, and premium/auth flags; this file renders the auth gate,
 * loading/empty states, and the analytics content.
 */
export default function AnalyticsScreen() {
  const f = useAnalytics();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="stats-chart-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h3" style={styles.title}>Analitikler</Text>
        <Text variant="body" style={styles.subtitle}>İstatistiklerinizi görmek için giriş yapın</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={f.t('mobile.settingsAnalytics')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {f.isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : !f.analytics ? (
        <View style={styles.emptyContainer}>
          <Text>Veri yüklenemedi</Text>
        </View>
      ) : (
        <AnalyticsContent f={f} />
      )}
    </View>
  );
}
