import { View } from 'react-native';
import { Card, Divider, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import { SettingItem } from './SettingItem';
import type { NotificationSettingsController } from '../_hooks/useNotificationSettings';

const { colors } = theme;

/** Anlık bildirim + bildirim türleri + e-posta/SMS kartları + bilgi kutusu. */
export function NotificationCards({ f }: { f: NotificationSettingsController }) {
  const { settings, handleToggle } = f;

  return (
    <>
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
    </>
  );
}
