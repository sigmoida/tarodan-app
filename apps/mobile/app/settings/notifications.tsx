import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, Card, Switch, Button, Divider, ActivityIndicator } from 'react-native-paper';
import { useState, useCallback, useEffect } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  
  // Push categories
  orderUpdates: boolean;
  messageNotifications: boolean;
  priceChanges: boolean;
  newListingsFromFollowed: boolean;
  marketingOffers: boolean;
  
  // Email categories
  emailOrderUpdates: boolean;
  emailWeeklyDigest: boolean;
  emailNewsletter: boolean;
  emailMarketing: boolean;
}

export default function NotificationSettingsScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<NotificationSettings>({
    pushEnabled: true,
    emailEnabled: true,
    orderUpdates: true,
    messageNotifications: true,
    priceChanges: true,
    newListingsFromFollowed: true,
    marketingOffers: false,
    emailOrderUpdates: true,
    emailWeeklyDigest: false,
    emailNewsletter: false,
    emailMarketing: false,
  });

  // Fetch notification settings
  const { data: settingsData, isLoading, refetch } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/notification-settings');
        return response.data;
      } catch (error) {
        console.log('Failed to fetch settings');
        return null;
      }
    },
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (settingsData) {
      setSettings(settingsData);
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

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newSettings: NotificationSettings) => {
      return api.patch('/users/me/notification-settings', newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      Alert.alert('Başarılı', 'Bildirim ayarları kaydedildi');
    },
    onError: () => {
      Alert.alert('Hata', 'Ayarlar kaydedilemedi');
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
        <Ionicons name="notifications-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Bildirim Ayarları</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Ayarlarınızı düzenlemek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bildirim Ayarları</Text>
        <TouchableOpacity onPress={handleSave} disabled={saveMutation.isPending}>
          <Text style={styles.saveButton}>
            {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Push Notifications */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Ionicons name="phone-portrait" size={24} color={TarodanColors.primary} />
                <Text variant="titleMedium" style={styles.sectionTitle}>Anlık Bildirimler</Text>
              </View>

              <SettingItem
                icon="notifications"
                label="Bildirimleri Etkinleştir"
                description="Tüm anlık bildirimleri aç/kapat"
                value={settings.pushEnabled}
                onToggle={() => handleToggle('pushEnabled')}
              />

              {settings.pushEnabled && (
                <>
                  <Divider style={styles.divider} />
                  
                  <SettingItem
                    icon="cart"
                    label="Sipariş Güncellemeleri"
                    description="Sipariş durumu değişikliklerinde bildir"
                    value={settings.orderUpdates}
                    onToggle={() => handleToggle('orderUpdates')}
                  />

                  <SettingItem
                    icon="chatbubble"
                    label="Mesaj Bildirimleri"
                    description="Yeni mesaj aldığınızda bildir"
                    value={settings.messageNotifications}
                    onToggle={() => handleToggle('messageNotifications')}
                  />

                  <SettingItem
                    icon="pricetag"
                    label="Fiyat Değişiklikleri"
                    description="Favori ürünlerin fiyatı düştüğünde bildir"
                    value={settings.priceChanges}
                    onToggle={() => handleToggle('priceChanges')}
                  />

                  <SettingItem
                    icon="person-add"
                    label="Takip Ettiklerinden Yeni İlanlar"
                    description="Takip ettiğiniz satıcılar yeni ilan eklediğinde"
                    value={settings.newListingsFromFollowed}
                    onToggle={() => handleToggle('newListingsFromFollowed')}
                  />

                  <SettingItem
                    icon="megaphone"
                    label="Pazarlama ve Teklifler"
                    description="Kampanya ve özel tekliflerden haberdar ol"
                    value={settings.marketingOffers}
                    onToggle={() => handleToggle('marketingOffers')}
                  />
                </>
              )}
            </Card.Content>
          </Card>

          {/* Email Notifications */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Ionicons name="mail" size={24} color={TarodanColors.primary} />
                <Text variant="titleMedium" style={styles.sectionTitle}>E-posta Bildirimleri</Text>
              </View>

              <SettingItem
                icon="mail"
                label="E-posta Bildirimlerini Etkinleştir"
                description="Tüm e-posta bildirimlerini aç/kapat"
                value={settings.emailEnabled}
                onToggle={() => handleToggle('emailEnabled')}
              />

              {settings.emailEnabled && (
                <>
                  <Divider style={styles.divider} />
                  
                  <SettingItem
                    icon="receipt"
                    label="Sipariş E-postaları"
                    description="Sipariş onayı ve durum güncellemeleri"
                    value={settings.emailOrderUpdates}
                    onToggle={() => handleToggle('emailOrderUpdates')}
                  />

                  <SettingItem
                    icon="calendar"
                    label="Haftalık Özet"
                    description="Her hafta aktivite özetinizi alın"
                    value={settings.emailWeeklyDigest}
                    onToggle={() => handleToggle('emailWeeklyDigest')}
                  />

                  <SettingItem
                    icon="newspaper"
                    label="Bülten"
                    description="Koleksiyonerler için haberler ve ipuçları"
                    value={settings.emailNewsletter}
                    onToggle={() => handleToggle('emailNewsletter')}
                  />

                  <SettingItem
                    icon="gift"
                    label="Pazarlama E-postaları"
                    description="Özel teklifler ve kampanyalar"
                    value={settings.emailMarketing}
                    onToggle={() => handleToggle('emailMarketing')}
                  />
                </>
              )}
            </Card.Content>
          </Card>

          {/* Info */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color={TarodanColors.info} />
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
  onToggle 
}: { 
  icon: string; 
  label: string; 
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.settingItem}>
      <Ionicons name={icon as any} size={20} color={TarodanColors.textSecondary} />
      <View style={styles.settingContent}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="bodySmall" style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onToggle} color={TarodanColors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  saveButton: {
    color: TarodanColors.textOnPrimary,
    fontWeight: '600',
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
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
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.info + '10',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    color: TarodanColors.info,
    fontSize: 13,
  },
});
