import { View, ScrollView, Text } from 'react-native';
import { Spinner, Button, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { styles } from './_lib/styles';
import { useBusinessStats } from './_hooks/useBusinessStats';
import {
  BusinessCompanyHeader,
  BusinessTabs,
  BusinessTabContent,
} from './_components/BusinessSections';

const { colors } = theme;

/**
 * Business dashboard — THIN screen. The `useBusinessStats` controller owns the
 * stats fetch, auth redirect, and tab state; this file renders the loading/error
 * gates and composes the company header, tabs, and tab content.
 */
export default function BusinessDashboardScreen() {
  const f = useBusinessStats();

  if (f.loading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>İstatistikler yükleniyor...</Text>
      </View>
    );
  }

  if (f.error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={f.t('mobile.settingsBusiness')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={64} color={colors.danger[600]!} />
          <Text style={styles.errorText}>{f.error}</Text>
          {f.error.includes('şirket adı') || f.error.includes('companyName') ? (
            <Button variant="primary" title="Şirket Adı Ekle" onPress={() => router.push('/settings/edit-profile')} />
          ) : (
            <Button variant="primary" title="Kurumsal Hesap Aç" onPress={() => router.push('/seller/register')} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={f.t('mobile.settingsBusiness')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <BusinessCompanyHeader f={f} />
        <BusinessTabs f={f} />
        <BusinessTabContent f={f} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
