import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Button, Spinner, Text, ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedRefreshControl } from '@/components/common';
import { useTranslation } from '@/i18n';
import { useNotificationSettings } from './_hooks/useNotificationSettings';
import { styles } from './_lib/styles';
import { NotificationCards } from './_components/NotificationCards';

const { colors } = theme;

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const f = useNotificationSettings();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="notifications-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h3" style={styles.title}>Bildirim Ayarları</Text>
        <Text variant="body" style={styles.subtitle}>Ayarlarınızı düzenlemek için giriş yapın</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('mobile.settingsNotifications')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={
          <TouchableOpacity onPress={f.handleSave} disabled={f.saveMutation.isPending}>
            <Text style={styles.saveButton}>
              {f.saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </Text>
          </TouchableOpacity>
        }
      />

      {f.isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
        >
          <NotificationCards f={f} />
        </ScrollView>
      )}
    </View>
  );
}
