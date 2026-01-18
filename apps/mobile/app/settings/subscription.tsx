import { View, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Text, Card, Button, Chip, Divider, ActivityIndicator, List, Snackbar } from 'react-native-paper';
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
  getSubscriptionStatusText 
} from '../../src/stores/subscriptionStore';
import { TarodanColors } from '../../src/theme';

export default function SubscriptionSettingsScreen() {
  const { isAuthenticated, user } = useAuthStore();
  const { 
    subscription, 
    billingHistory, 
    isLoading, 
    error,
    fetchSubscription, 
    fetchBillingHistory,
    cancelSubscription,
    reactivateSubscription,
    clearError
  } = useSubscriptionStore();
  
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

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
      setSnackbar({ visible: true, message: error });
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
              setSnackbar({ visible: true, message: 'Abonelik iptal edildi' });
            } catch (e) {
              // Error handled by store
            }
          }
        },
      ]
    );
  };

  const handleReactivate = async () => {
    try {
      await reactivateSubscription();
      setSnackbar({ visible: true, message: 'Abonelik yeniden aktifleştirildi!' });
    } catch (e) {
      // Error handled by store
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="titleLarge">Giriş Yapın</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Abonelik ayarlarınızı görmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  const isPremium = subscription && isSubscriptionActive(subscription);
  const isCancelled = subscription?.status === 'cancelled';
  const daysLeft = subscription ? getDaysUntilRenewal(subscription) : 0;
  const statusInfo = subscription ? getSubscriptionStatusText(subscription.status) : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Abonelik Yönetimi</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading && !subscription ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Current Plan */}
          <Card style={styles.planCard}>
            <Card.Content>
              <View style={styles.planHeader}>
                <View>
                  <Text variant="titleLarge" style={styles.planName}>
                    {isPremium ? 'Premium Üyelik' : 'Ücretsiz Üyelik'}
                  </Text>
                  {statusInfo && (
                    <Chip 
                      compact 
                      style={[styles.statusChip, { backgroundColor: statusInfo.color + '20' }]}
                      textStyle={{ color: statusInfo.color }}
                    >
                      {statusInfo.text}
                    </Chip>
                  )}
                </View>
                {isPremium && (
                  <MaterialCommunityIcons name="crown" size={40} color={TarodanColors.primary} />
                )}
              </View>

              {isPremium && subscription && (
                <>
                  <Divider style={styles.divider} />
                  
                  <View style={styles.planDetails}>
                    <View style={styles.detailRow}>
                      <Text variant="bodyMedium" style={styles.detailLabel}>Plan:</Text>
                      <Text variant="bodyMedium" style={styles.detailValue}>
                        {formatBillingPeriod(subscription.billingPeriod)}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text variant="bodyMedium" style={styles.detailLabel}>
                        {isCancelled ? 'Bitiş Tarihi:' : 'Sonraki Ödeme:'}
                      </Text>
                      <Text variant="bodyMedium" style={styles.detailValue}>
                        {format(new Date(subscription.currentPeriodEnd), 'dd MMMM yyyy', { locale: tr })}
                      </Text>
                    </View>
                    
                    {daysLeft > 0 && (
                      <View style={styles.detailRow}>
                        <Text variant="bodyMedium" style={styles.detailLabel}>Kalan Süre:</Text>
                        <Text variant="bodyMedium" style={[styles.detailValue, { color: TarodanColors.primary }]}>
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
                  <Text variant="bodyMedium" style={styles.upgradePrompt}>
                    Premium üyelikle sınırsız ilan, takas özelliği ve daha fazlasına erişin!
                  </Text>
                  <Button 
                    mode="contained" 
                    onPress={() => router.push('/upgrade')}
                    style={styles.upgradeButton}
                    icon="crown"
                  >
                    Premium'a Yükselt
                  </Button>
                </>
              )}
            </Card.Content>
          </Card>

          {/* Premium Features */}
          {isPremium && (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Premium Özellikleriniz</Text>
                
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
                        <Ionicons name={feature.icon as any} size={20} color={TarodanColors.primary} />
                      </View>
                      <Text variant="bodySmall" style={styles.featureText}>{feature.text}</Text>
                    </View>
                  ))}
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Billing History */}
          {billingHistory.length > 0 && (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Fatura Geçmişi</Text>
                
                {billingHistory.map((payment, index) => (
                  <TouchableOpacity
                    key={payment.id}
                    style={styles.billingItem}
                    onPress={() => payment.invoiceUrl && Linking.openURL(payment.invoiceUrl)}
                  >
                    <View style={styles.billingInfo}>
                      <Text variant="bodyMedium">
                        {format(new Date(payment.periodStart), 'MMM yyyy', { locale: tr })} - 
                        {format(new Date(payment.periodEnd), 'MMM yyyy', { locale: tr })}
                      </Text>
                      <Text variant="bodySmall" style={styles.billingDate}>
                        {format(new Date(payment.createdAt), 'dd MMM yyyy', { locale: tr })}
                      </Text>
                    </View>
                    <View style={styles.billingAmount}>
                      <Text variant="titleSmall" style={styles.amount}>
                        ₺{payment.amount.toLocaleString('tr-TR')}
                      </Text>
                      <Chip 
                        compact 
                        style={[
                          styles.paymentStatusChip,
                          { backgroundColor: payment.status === 'paid' ? TarodanColors.success + '20' : TarodanColors.error + '20' }
                        ]}
                        textStyle={{ 
                          color: payment.status === 'paid' ? TarodanColors.success : TarodanColors.error,
                          fontSize: 10 
                        }}
                      >
                        {payment.status === 'paid' ? 'Ödendi' : 'Bekliyor'}
                      </Chip>
                    </View>
                    {payment.invoiceUrl && (
                      <Ionicons name="download-outline" size={20} color={TarodanColors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </Card.Content>
            </Card>
          )}

          {/* Subscription Actions */}
          {isPremium && subscription && (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Abonelik İşlemleri</Text>
                
                <List.Item
                  title="Ödeme Yöntemi"
                  description="Kredi kartı bilgilerinizi güncelleyin"
                  left={props => <List.Icon {...props} icon="credit-card" />}
                  right={props => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => router.push('/settings/payment-methods')}
                  style={styles.listItem}
                />
                
                <List.Item
                  title="Plan Değiştir"
                  description={subscription.billingPeriod === 'monthly' ? 'Yıllık plana geç ve tasarruf et' : 'Aylık plana geç'}
                  left={props => <List.Icon {...props} icon="swap-vertical" />}
                  right={props => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => router.push('/upgrade')}
                  style={styles.listItem}
                />

                {!isCancelled ? (
                  <List.Item
                    title="Aboneliği İptal Et"
                    description="Dönem sonunda premium özellikler kapanır"
                    titleStyle={{ color: TarodanColors.error }}
                    left={props => <List.Icon {...props} icon="close-circle" color={TarodanColors.error} />}
                    onPress={handleCancel}
                    style={styles.listItem}
                  />
                ) : (
                  <List.Item
                    title="Aboneliği Yeniden Aktifleştir"
                    description="Premium özelliklerinize devam edin"
                    titleStyle={{ color: TarodanColors.success }}
                    left={props => <List.Icon {...props} icon="refresh" color={TarodanColors.success} />}
                    onPress={handleReactivate}
                    style={styles.listItem}
                  />
                )}
              </Card.Content>
            </Card>
          )}

          {/* Downgrade Warning */}
          {isCancelled && daysLeft > 0 && (
            <Card style={styles.warningCard}>
              <Card.Content style={styles.warningContent}>
                <Ionicons name="warning" size={24} color={TarodanColors.warning} />
                <View style={styles.warningText}>
                  <Text variant="titleSmall">Aboneliğiniz {daysLeft} gün sonra sona erecek</Text>
                  <Text variant="bodySmall" style={styles.warningDesc}>
                    Dönem sonunda ücretsiz üyeliğe geçiş yapılacak ve bazı özellikler kısıtlanacaktır.
                  </Text>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Help */}
          <TouchableOpacity style={styles.helpLink} onPress={() => router.push('/help')}>
            <Ionicons name="help-circle" size={20} color={TarodanColors.primary} />
            <Text style={styles.helpText}>Abonelik ile ilgili yardım</Text>
          </TouchableOpacity>

          <View style={{ height: 50 }} />
        </ScrollView>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
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
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
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
  planCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
    borderWidth: 2,
    borderColor: TarodanColors.primary + '40',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planName: {
    color: TarodanColors.textPrimary,
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
    color: TarodanColors.textSecondary,
  },
  detailValue: {
    fontWeight: '500',
  },
  upgradePrompt: {
    color: TarodanColors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  upgradeButton: {
    backgroundColor: TarodanColors.primary,
  },
  card: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  sectionTitle: {
    marginBottom: 16,
    color: TarodanColors.textPrimary,
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
    backgroundColor: TarodanColors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  featureText: {
    textAlign: 'center',
    color: TarodanColors.textPrimary,
  },
  billingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  billingInfo: {
    flex: 1,
  },
  billingDate: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  billingAmount: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  amount: {
    color: TarodanColors.textPrimary,
    fontWeight: 'bold',
  },
  paymentStatusChip: {
    marginTop: 4,
  },
  listItem: {
    paddingHorizontal: 0,
  },
  warningCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.warning + '15',
    borderWidth: 1,
    borderColor: TarodanColors.warning + '40',
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
  },
  warningDesc: {
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.primary,
    fontWeight: '500',
  },
});
