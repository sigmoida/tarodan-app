import { View } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import { formatTL } from '../_lib/tiers';
import type { MembershipCheckoutController } from '../_hooks/useMembershipCheckout';

const { colors } = theme;

/** Seçili plan kartı — ad, fiyat, popüler rozeti, ilk 3 özellik. */
export function PlanCard({ f }: { f: MembershipCheckoutController }) {
  const { tier, displayPrice, periodLabel } = f;
  return (
    <Card style={[styles.planCard, { borderColor: tier.color }]}>
      <View style={styles.planHeader}>
        <View>
          <Text style={[styles.planName, { color: tier.color }]}>{tier.name}</Text>
          <Text style={styles.planPrice}>
            ₺{formatTL(displayPrice)}<Text style={styles.planPeriod}>/{periodLabel}</Text>
          </Text>
        </View>
        {'popular' in tier && tier.popular && (
          <View style={[styles.popularBadge, { backgroundColor: tier.color }]}>
            <Text style={styles.popularBadgeText}>Popüler</Text>
          </View>
        )}
      </View>
      <View style={styles.featuresCompact}>
        {tier.features.slice(0, 3).map((feature, index) => (
          <View key={index} style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={16} color={tier.color} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
        {tier.features.length > 3 && (
          <Text style={styles.moreFeatures}>+{tier.features.length - 3} daha fazla</Text>
        )}
      </View>
    </Card>
  );
}

/** PayTR güvenli ödeme bilgi kartı. */
export function PaymentMethodCard() {
  return (
    <>
      <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
      <Card style={styles.paymentCard}>
        <View style={styles.paymentOption}>
          <Ionicons name="lock-closed" size={20} color={colors.success[600]!} />
          <Text style={styles.paymentOptionText}>
            Ödemeniz PayTR güvenli altyapısı üzerinden alınır. Kart bilgileriniz
            Tarodan'a kaydedilmez; bir sonraki adımda PayTR'nin 3D Secure ödeme
            sayfası açılır.
          </Text>
        </View>
      </Card>
    </>
  );
}

/** Sipariş özeti (KDV dahil tek satır + toplam). */
export function OrderSummary({ f }: { f: MembershipCheckoutController }) {
  const { tier, displayPrice, periodLabel } = f;
  return (
    <>
      <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{tier.name} Üyelik ({periodLabel === 'yıl' ? 'Yıllık' : 'Aylık'})</Text>
          <Text style={styles.summaryValue}>₺{formatTL(displayPrice)}</Text>
        </View>
        <Text style={styles.vatNote}>KDV dahildir</Text>
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalValue}>₺{formatTL(displayPrice)}</Text>
        </View>
      </Card>
    </>
  );
}

/** Kullanım koşulları / gizlilik onay metni. */
export function CheckoutTerms() {
  return (
    <Text style={styles.terms}>
      Ödemeyi tamamlayarak{' '}
      <Text style={styles.termsLink} onPress={() => router.push('/terms')}>Kullanım Koşulları</Text>
      {' '}ve{' '}
      <Text style={styles.termsLink} onPress={() => router.push('/privacy')}>Gizlilik Politikası</Text>
      'nı kabul etmiş olursunuz.
    </Text>
  );
}
