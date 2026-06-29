import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Card,
  Switch,
  Button,
  Divider,
  Spinner,
  Text,
  ScreenHeader,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';

const { colors, spacing, radius } = theme;

// Backend sözleşmesiyle (UpdateNotificationSettingsDto / web) birebir aynı anahtarlar.
// ESKİDEN mobil farklı isimler (pushEnabled, messageNotifications...) gönderiyordu;
// ValidationPipe whitelist'i eşleşmeyenleri sessizce atıyordu → tercih hiç kaydolmuyordu
// (Bulgu #9). Artık kanonik anahtarlar kullanılıyor.
interface NotificationSettings {
  // Kanal master anahtarları
  pushNotifications: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;

  // Kategori anahtarları (tüm kanallara uygulanır)
  orderUpdates: boolean;
  messageAlerts: boolean;
  priceDropAlerts: boolean;
  newListingAlerts: boolean;
  marketingEmails: boolean;
}

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<NotificationSettings>({
    // Varsayılanlar API DEFAULT_NOTIFICATION_SETTINGS ile aynı.
    pushNotifications: true,
    emailNotifications: true,
    smsNotifications: false,
    orderUpdates: true,
    messageAlerts: true,
    priceDropAlerts: true,
    newListingAlerts: false,
    marketingEmails: false,
  });

  // Fetch notification settings
  const { data: settingsData, isLoading, refetch } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/settings').catch(() => null);
        return response?.data ?? null;
      } catch (error) {
        console.log('Failed to fetch settings');
        return null;
      }
    },
    enabled: isAuthenticated,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  useEffect(() => {
    if (settingsData) {
      setSettings(prev => ({ ...prev, ...settingsData }));
    }
  }, [settingsData]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  // Save mutation. Anahtarlar PATCH /users/me/settings (UpdateNotificationSettingsDto)
  // ile birebir; backend bu tercihleri gönderim yollarında uygular (Bulgu #9 fix).
  const saveMutation = useMutation({
    mutationFn: async (newSettings: NotificationSettings) => {
      return api.patch('/users/me/settings', newSettings).catch(() => null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      appAlert('Başarılı', 'Bildirim ayarları kaydedildi');
    },
  });

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="notifications-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h3" style={styles.title}>Bildirim Ayarları</Text>
        <Text variant="body" style={styles.subtitle}>
          Ayarlarınızı düzenlemek için giriş yapın
        </Text>
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
          <TouchableOpacity onPress={handleSave} disabled={saveMutation.isPending}>
            <Text style={styles.saveButton}>
              {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </Text>
          </TouchableOpacity>
        }
      />

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Push Notifications */}
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="phone-portrait" size={24} color={colors.primary[600]!} />
              <Text variant="h3" style={styles.sectionTitle}>Anlık Bildirimler</Text>
            </View>

            <SettingItem
              icon="notifications"
              label="Anlık Bildirimleri Etkinleştir"
              description="Cihazınıza gönderilen tüm push bildirimleri aç/kapat"
              value={settings.pushNotifications}
              onToggle={() => handleToggle('pushNotifications')}
            />
          </Card>

          {/* Notification Categories (apply to push + in-app + email) */}
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="options" size={24} color={colors.primary[600]!} />
              <Text variant="h3" style={styles.sectionTitle}>Bildirim Türleri</Text>
            </View>

            <SettingItem
              icon="cart"
              label="Sipariş Güncellemeleri"
              description="Sipariş, teklif, takas ve iade durumu değişiklikleri"
              value={settings.orderUpdates}
              onToggle={() => handleToggle('orderUpdates')}
            />

            <SettingItem
              icon="chatbubble"
              label="Mesaj Bildirimleri"
              description="Yeni mesaj aldığınızda bildir"
              value={settings.messageAlerts}
              onToggle={() => handleToggle('messageAlerts')}
            />

            <SettingItem
              icon="pricetag"
              label="Fiyat Düşüşü Uyarıları"
              description="Favori/takip ürünlerin fiyatı düştüğünde veya stoğa girdiğinde"
              value={settings.priceDropAlerts}
              onToggle={() => handleToggle('priceDropAlerts')}
            />

            <SettingItem
              icon="person-add"
              label="Takip Ettiklerinden Yeni İlanlar"
              description="Takip ettiğiniz satıcılar yeni ilan eklediğinde"
              value={settings.newListingAlerts}
              onToggle={() => handleToggle('newListingAlerts')}
            />

            <SettingItem
              icon="megaphone"
              label="Pazarlama ve Teklifler"
              description="Kampanya ve özel tekliflerden haberdar ol"
              value={settings.marketingEmails}
              onToggle={() => handleToggle('marketingEmails')}
            />
          </Card>

          {/* Email & SMS channels */}
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mail" size={24} color={colors.primary[600]!} />
              <Text variant="h3" style={styles.sectionTitle}>E-posta ve SMS</Text>
            </View>

            <SettingItem
              icon="mail"
              label="E-posta Bildirimlerini Etkinleştir"
              description="Yukarıdaki türler için e-posta gönderilsin"
              value={settings.emailNotifications}
              onToggle={() => handleToggle('emailNotifications')}
            />

            <Divider style={styles.divider} />

            <SettingItem
              icon="chatbox-ellipses"
              label="SMS Bildirimleri"
              description="Önemli güncellemeler için SMS gönderilsin"
              value={settings.smsNotifications}
              onToggle={() => handleToggle('smsNotifications')}
            />
          </Card>

          {/* Info */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color={colors.info[600]!} />
            <Text style={styles.infoText}>
              Bildirim tercihlerinizi istediğiniz zaman değiştirebilirsiniz.
              Önemli güvenlik ve hesap bildirimleri her zaman gönderilir.
            </Text>
          </View>

          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </View>
  );
}

// Setting Item Component
function SettingItem({
  icon,
  label,
  description,
  value,
  onToggle,
}: {
  icon: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.settingItem}>
      <Ionicons name={icon as any} size={20} color={colors.text.muted} />
      <View style={styles.settingContent}>
        <Text variant="body">{label}</Text>
        <Text variant="bodySm" style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  saveButton: {
    color: colors.white,
    fontWeight: '600',
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    marginLeft: 12,
  },
  divider: {
    marginVertical: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  settingDescription: {
    color: colors.text.muted,
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: colors.info[50]!,
    padding: 12,
    borderRadius: radius.md,
    gap: 8,
  },
  infoText: {
    flex: 1,
    color: colors.info[600]!,
    fontSize: 13,
  },
});
