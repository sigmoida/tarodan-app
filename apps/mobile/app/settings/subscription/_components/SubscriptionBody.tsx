import React from 'react';
import { View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Card, Button, Chip, Divider, Text, theme } from '@tarodan/ui-native';

import { formatBillingPeriod } from '../../../../src/stores/subscriptionStore';
import { styles } from '../_lib/styles';
import type { SubscriptionController } from '../_hooks/useSubscription';

const { colors } = theme;

/** Current plan, premium features, billing history, actions, warnings, help. */
export function SubscriptionBody({ f }: { f: SubscriptionController }) {
  const { subscription, isPremium, isCancelled, daysLeft, statusInfo } = f;

  return (
    <ScrollView style={styles.content}>
      {/* Current Plan */}
      <Card style={styles.planCard}>
        <View style={styles.planHeader}>
          <View>
            <Text variant="h2" style={styles.planName}>
              {subscription?.tier?.name ?? (isPremium ? 'Premium Üyelik' : 'Ücretsiz Üyelik')}
            </Text>
            {isPremium && statusInfo && (
              <Chip variant={f.statusChipVariant} size="sm" style={styles.statusChip} label={statusInfo.text} />
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
      {f.billingHistory.length > 0 && (
        <Card style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Fatura Geçmişi</Text>

          {f.billingHistory.map((payment) => (
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

          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/upgrade')}>
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
            <TouchableOpacity style={styles.actionRow} onPress={f.handleCancel}>
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
            <TouchableOpacity style={styles.actionRow} onPress={f.handleReactivate}>
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
  );
}
