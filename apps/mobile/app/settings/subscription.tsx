import { View, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import {
  Card,
  Button,
  Chip,
  Divider,
  Spinner,
  Snackbar,
  Text,
  theme,
  ScreenHeader,
} from '@tarodan/ui-native';
import { useState, useEffect, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuthStore } from '../../src/stores/authStore';
import {
  useSubscriptionStore,
  isSubscriptionActive,
  getDaysUntilRenewal,
  formatBillingPeriod,
  getSubscriptionStatusText,
} from '../../src/stores/subscriptionStore';
import { useTranslation } from '../../src/i18n';

const { colors } = theme;

export default function SubscriptionSettingsScreen() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const {
    subscription,
    billingHistory,
    isLoading,
    error,
    fetchSubscription,
    fetchBillingHistory,
    cancelSubscription,
    reactivateSubscription,
    clearError,
  } = useSubscriptionStore();

  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant?: 'default' | 'success' | 'danger';
  }>({ visible: false, message: '' });

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchSubscription();
        fetchBillingHistory();
      }
    }, [isAuthenticated])
  );

  useEffect(() => {
    if (error) {
      setSnackbar({ visible: true, message: error, variant: 'danger' });
      clearError();
    }
  }, [error]);

  const handleCancel = () => {
    Alert.alert(
      'Aboneliği İptal Et',
      'Aboneliğinizi iptal etmek istediğinize emin misiniz? Dönem sonuna kadar premium özelliklerden yararlanmaya devam edebilirsiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSubscription();
              setSnackbar({ visible: true, message: 'Abonelik iptal edildi', variant: 'success' });
            } catch (e) {
              // Error handled by store
            }
          },
        },
      ]
    );
  };

  const handleReactivate = async () => {
    try {
      await reactivateSubscription();
      setSnackbar({ visible: true, message: 'Abonelik yeniden aktifleştirildi!', variant: 'success' });
    } catch (e) {
      // Error handled by store
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h3">Giriş Yapın</Text>
        <Text variant="body" style={styles.subtitle}>
          Abonelik ayarlarınızı görmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  // Web ile aynı mantık (profile/membership/page.tsx): yalnızca AKTİF ve ücretli
  // (free olmayan) üyelik "premium" sayılır. Backend her kullanıcıya aktif bir
  // ücretsiz üyelik açtığı için (status=active, ~100 yıl geçerli), sadece
  // isSubscriptionActive() kontrolü TÜM kullanıcıları (ücretsiz dâhil) premium
  // gösteriyordu. Bu yüzden tier tipini de kontrol ediyoruz.
  const tierType = subscription?.tier?.type ?? 'free';
  const isPremium = !!subscription && isSubscriptionActive(subscription) && tierType !== 'free';
  const isCancelled = subscription?.status === 'cancelled';
  const daysLeft = subscription ? getDaysUntilRenewal(subscription) : 0;
  const statusInfo = subscription ? getSubscriptionStatusText(subscription.status) : null;

  // Map status text color to a Chip variant
  const statusChipVariant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' =
    statusInfo
      ? subscription?.status === 'active'
        ? 'success'
        : subscription?.status === 'cancelled'
          ? 'warning'
          : subscription?.status === 'past_due'
            ? 'danger'
            : 'neutral'
      : 'neutral';

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.settingsSubscription')} onBack={() => router.back()} />

      {isLoading && !subscription ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Current Plan */}
          <Card style={styles.planCard}>
            <View style={styles.planHeader}>
              <View>
                <Text variant="h2" style={styles.planName}>
                  {subscription?.tier?.name ?? (isPremium ? 'Premium Üyelik' : 'Ücretsiz Üyelik')}
                </Text>
                {isPremium && statusInfo && (
                  <Chip
                    variant={statusChipVariant}
                    size="sm"
                    style={styles.statusChip}
                    label={statusInfo.text}
                  />
                )}
              </View>
              {isPremium && (
                <MaterialCommunityIcons name="crown" size={40} color={colors.primary[600]!} />
              )}
            </View>

            {isPremium && subscription && (
              <>
                <Divider style={styles.divider} />

                <View style={styles.planDetails}>
                  <View style={styles.detailRow}>
                    <Text variant="body" style={styles.detailLabel}>Plan:</Text>
                    <Text variant="body" style={styles.detailValue}>
                      {formatBillingPeriod(subscription.billingPeriod)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text variant="body" style={styles.detailLabel}>
                      {isCancelled ? 'Bitiş Tarihi:' : 'Sonraki Ödeme:'}
                    </Text>
                    <Text variant="body" style={styles.detailValue}>
                      {format(new Date(subscription.currentPeriodEnd), 'dd MMMM yyyy', { locale: tr })}
                    </Text>
                  </View>

                  {daysLeft > 0 && (
                    <View style={styles.detailRow}>
                      <Text variant="body" style={styles.detailLabel}>Kalan Süre:</Text>
                      <Text variant="body" style={[styles.detailValue, { color: colors.primary[600]! }]}>
                        {daysLeft} gün
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {!isPremium && (
              <>
                <Divider style={styles.divider} />
                <Text variant="body" style={styles.upgradePrompt}>
                  Premium üyelikle sınırsız ilan, takas özelliği ve daha fazlasına erişin!
                </Text>
                <Button
                  variant="primary"
                  title="Premium'a Yükselt"
                  icon="diamond"
                  onPress={() => router.push('/upgrade')}
                  style={styles.upgradeButton}
                />
              </>
            )}
          </Card>

          {/* Premium Features */}
          {isPremium && (
            <Card style={styles.card}>
              <Text variant="h3" style={styles.sectionTitle}>Premium Özellikleriniz</Text>

              <View style={styles.featuresGrid}>
                {[
                  { icon: 'pricetag', text: 'Sınırsız İlan' },
                  { icon: 'camera', text: '15 Fotoğraf' },
                  { icon: 'swap-horizontal', text: 'Takas' },
                  { icon: 'images', text: 'Dijital Garaj' },
                  { icon: 'star', text: 'Öne Çıkarma' },
                  { icon: 'analytics', text: 'Analitik' },
                ].map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <View style={styles.featureIcon}>
                      <Ionicons name={feature.icon as any} size={20} color={colors.primary[600]!} />
                    </View>
                    <Text variant="bodySm" style={styles.featureText}>{feature.text}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Billing History */}
          {billingHistory.length > 0 && (
            <Card style={styles.card}>
              <Text variant="h3" style={styles.sectionTitle}>Fatura Geçmişi</Text>

              {billingHistory.map((payment) => (
                <TouchableOpacity
                  key={payment.id}
                  style={styles.billingItem}
                  onPress={() => payment.invoiceUrl && Linking.openURL(payment.invoiceUrl)}
                >
                  <View style={styles.billingInfo}>
                    <Text variant="body">
                      {format(new Date(payment.periodStart), 'MMM yyyy', { locale: tr })} -
                      {format(new Date(payment.periodEnd), 'MMM yyyy', { locale: tr })}
                    </Text>
                    <Text variant="bodySm" style={styles.billingDate}>
                      {format(new Date(payment.createdAt), 'dd MMM yyyy', { locale: tr })}
                    </Text>
                  </View>
                  <View style={styles.billingAmount}>
                    <Text variant="body" style={styles.amount}>
                      ₺{(payment.amount ?? 0).toLocaleString('tr-TR')}
                    </Text>
                    <Chip
                      variant={payment.status === 'paid' ? 'success' : 'danger'}
                      size="sm"
                      style={styles.paymentStatusChip}
                      label={payment.status === 'paid' ? 'Ödendi' : 'Bekliyor'}
                    />

                  </View>
                  {payment.invoiceUrl && (
                    <Ionicons name="download-outline" size={20} color={colors.primary[600]!} />
                  )}
                </TouchableOpacity>
              ))}
            </Card>
          )}

          {/* Subscription Actions */}
          {isPremium && subscription && (
            <Card style={styles.card}>
              <Text variant="h3" style={styles.sectionTitle}>Abonelik İşlemleri</Text>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => router.push('/settings/payment-methods' as any)}
              >
                <Ionicons name="card-outline" size={24} color={colors.text.muted} />
                <View style={styles.actionTextWrap}>
                  <Text variant="body" style={styles.actionTitle}>Ödeme Yöntemi</Text>
                  <Text variant="bodySm" style={styles.actionDesc}>
                    Kredi kartı bilgilerinizi güncelleyin
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
              </TouchableOpacity>

              <Divider style={styles.divider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => router.push('/upgrade')}
              >
                <Ionicons name="swap-vertical" size={24} color={colors.text.muted} />
                <View style={styles.actionTextWrap}>
                  <Text variant="body" style={styles.actionTitle}>Plan Değiştir</Text>
                  <Text variant="bodySm" style={styles.actionDesc}>
                    {subscription.billingPeriod === 'monthly' ? 'Yıllık plana geç ve tasarruf et' : 'Aylık plana geç'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
              </TouchableOpacity>

              <Divider style={styles.divider} />

              {!isCancelled ? (
                <TouchableOpacity style={styles.actionRow} onPress={handleCancel}>
                  <Ionicons name="close-circle-outline" size={24} color={colors.danger[600]!} />
                  <View style={styles.actionTextWrap}>
                    <Text variant="body" style={[styles.actionTitle, { color: colors.danger[600]! }]}>
                      Aboneliği İptal Et
                    </Text>
                    <Text variant="bodySm" style={styles.actionDesc}>
                      Dönem sonunda premium özellikler kapanır
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionRow} onPress={handleReactivate}>
                  <Ionicons name="refresh" size={24} color={colors.success[600]!} />
                  <View style={styles.actionTextWrap}>
                    <Text variant="body" style={[styles.actionTitle, { color: colors.success[600]! }]}>
                      Aboneliği Yeniden Aktifleştir
                    </Text>
                    <Text variant="bodySm" style={styles.actionDesc}>
                      Premium özelliklerinize devam edin
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </Card>
          )}

          {/* Downgrade Warning */}
          {isCancelled && daysLeft > 0 && (
            <Card style={styles.warningCard}>
              <View style={styles.warningContent}>
                <Ionicons name="warning" size={24} color={colors.warning[600]!} />
                <View style={styles.warningText}>
                  <Text variant="body" style={styles.warningTitle}>
                    Aboneliğiniz {daysLeft} gün sonra sona erecek
                  </Text>
                  <Text variant="bodySm" style={styles.warningDesc}>
                    Dönem sonunda ücretsiz üyeliğe geçiş yapılacak ve bazı özellikler kısıtlanacaktır.
                  </Text>
                </View>
              </View>
            </Card>
          )}

          {/* Help */}
          <TouchableOpacity style={styles.helpLink} onPress={() => router.push('/help')}>
            <Ionicons name="help-circle" size={20} color={colors.primary[600]!} />
            <Text style={styles.helpText}>Abonelik ile ilgili yardım</Text>
          </TouchableOpacity>

          <View style={{ height: 50 }} />
        </ScrollView>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
        variant={snackbar.variant ?? 'default'}
      >
        {snackbar.message}
      </Snackbar>
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
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
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
  planCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 2,
    borderColor: colors.primary[200]!,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planName: {
    color: colors.text.heading,
    fontWeight: 'bold',
  },
  statusChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  divider: {
    marginVertical: 16,
  },
  planDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: colors.text.muted,
  },
  detailValue: {
    fontWeight: '500',
  },
  upgradePrompt: {
    color: colors.text.muted,
    marginBottom: 16,
    textAlign: 'center',
  },
  upgradeButton: {
    alignSelf: 'stretch',
  },
  card: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featureItem: {
    width: '33%',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureText: {
    textAlign: 'center',
    color: colors.text.heading,
  },
  billingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  billingInfo: {
    flex: 1,
  },
  billingDate: {
    color: colors.text.muted,
    marginTop: 2,
  },
  billingAmount: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  amount: {
    color: colors.text.heading,
    fontWeight: 'bold',
  },
  paymentStatusChip: {
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    fontWeight: '500',
    color: colors.text.heading,
  },
  actionDesc: {
    color: colors.text.muted,
    marginTop: 2,
  },
  warningCard: {
    marginBottom: 16,
    backgroundColor: colors.warning[50]!,
    borderWidth: 1,
    borderColor: colors.warning[200]!,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    fontWeight: '600',
    color: colors.text.heading,
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
  },
  warningDesc: {
    color: colors.text.muted,
    marginTop: 4,
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  helpText: {
    marginLeft: 8,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
