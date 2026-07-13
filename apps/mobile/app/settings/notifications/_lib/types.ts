// Backend sözleşmesiyle (UpdateNotificationSettingsDto / web) birebir aynı anahtarlar.
// ESKİDEN mobil farklı isimler (pushEnabled, messageNotifications...) gönderiyordu;
// ValidationPipe whitelist'i eşleşmeyenleri sessizce atıyordu → tercih hiç kaydolmuyordu
// (Bulgu #9). Artık kanonik anahtarlar kullanılıyor.
export interface NotificationSettings {
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

// Varsayılanlar API DEFAULT_NOTIFICATION_SETTINGS ile aynı.
export const DEFAULT_SETTINGS: NotificationSettings = {
  pushNotifications: true,
  emailNotifications: true,
  smsNotifications: false,
  orderUpdates: true,
  messageAlerts: true,
  priceDropAlerts: true,
  newListingAlerts: false,
  marketingEmails: false,
};
