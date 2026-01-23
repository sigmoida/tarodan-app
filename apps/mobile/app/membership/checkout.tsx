import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Button, RadioButton, Card, ActivityIndicator, TextInput } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

const MEMBERSHIP_TIERS = {
  basic: {
    id: 'basic',
    name: 'Temel',
    price: 49,
    period: 'ay',
    features: [
      '15 ücretsiz ilan',
      '50 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '2 öne çıkan ilan',
    ],
    color: '#3B82F6',
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 99,
    period: 'ay',
    features: [
      '50 ücretsiz ilan',
      '200 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '10 öne çıkan ilan',
      'Reklamsız deneyim',
      'Öncelikli destek',
    ],
    color: '#8B5CF6',
    popular: true,
  },
  business: {
    id: 'business',
    name: 'İş',
    price: 199,
    period: 'ay',
    features: [
      '200 ücretsiz ilan',
      '1000 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '50 öne çıkan ilan',
      'Reklamsız deneyim',
      'Öncelikli destek',
      'API erişimi',
      'Özel satıcı rozeti',
    ],
    color: '#F59E0B',
  },
};

export default function MembershipCheckoutScreen() {
  const { tier: tierParam } = useLocalSearchParams<{ tier: string }>();
  const { isAuthenticated } = useAuthStore();
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');

  const tier = MEMBERSHIP_TIERS[tierParam as keyof typeof MEMBERSHIP_TIERS] || MEMBERSHIP_TIERS.premium;

  // Not authenticated redirect
  if (!isAuthenticated) {
    router.replace('/(auth)/login');
    return null;
  }

  const handlePayment = async () => {
    setLoading(true);
    // Simulate payment process
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
    router.replace('/membership/success');
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').slice(0, 19) : cleaned;
  };

  const formatExpiry = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Üyelik Satın Al</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Selected Plan */}
        <Card style={[styles.planCard, { borderColor: tier.color }]}>
          <Card.Content>
            <View style={styles.planHeader}>
              <View>
                <Text style={[styles.planName, { color: tier.color }]}>{tier.name}</Text>
                <Text style={styles.planPrice}>
                  ₺{tier.price}<Text style={styles.planPeriod}>/{tier.period}</Text>
                </Text>
              </View>
              {tier.popular && (
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
          </Card.Content>
        </Card>

        {/* Payment Method */}
        <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
        <Card style={styles.paymentCard}>
          <Card.Content>
            <RadioButton.Group onValueChange={setPaymentMethod} value={paymentMethod}>
              <TouchableOpacity 
                style={styles.paymentOption}
                onPress={() => setPaymentMethod('card')}
              >
                <RadioButton value="card" color={TarodanColors.primary} />
                <Ionicons name="card-outline" size={24} color={TarodanColors.textPrimary} />
                <Text style={styles.paymentOptionText}>Kredi/Banka Kartı</Text>
              </TouchableOpacity>
            </RadioButton.Group>
          </Card.Content>
        </Card>

        {/* Card Details */}
        {paymentMethod === 'card' && (
          <View style={styles.cardForm}>
            <TextInput
              label="Kart Üzerindeki İsim"
              value={cardName}
              onChangeText={setCardName}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Kart Numarası"
              value={cardNumber}
              onChangeText={(text) => setCardNumber(formatCardNumber(text))}
              mode="outlined"
              style={styles.input}
              keyboardType="numeric"
              maxLength={19}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
              left={<TextInput.Icon icon="credit-card-outline" />}
            />
            <View style={styles.cardRow}>
              <TextInput
                label="Son Kullanma"
                value={cardExpiry}
                onChangeText={(text) => setCardExpiry(formatExpiry(text))}
                mode="outlined"
                style={[styles.input, styles.halfInput]}
                keyboardType="numeric"
                maxLength={5}
                placeholder="MM/YY"
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />
              <TextInput
                label="CVC"
                value={cardCvc}
                onChangeText={setCardCvc}
                mode="outlined"
                style={[styles.input, styles.halfInput]}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />
            </View>
          </View>
        )}

        {/* Order Summary */}
        <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
        <Card style={styles.summaryCard}>
          <Card.Content>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{tier.name} Üyelik</Text>
              <Text style={styles.summaryValue}>₺{tier.price}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>KDV (%20)</Text>
              <Text style={styles.summaryValue}>₺{(tier.price * 0.2).toFixed(2)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Toplam</Text>
              <Text style={styles.totalValue}>₺{(tier.price * 1.2).toFixed(2)}</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Terms */}
        <Text style={styles.terms}>
          Ödemeyi tamamlayarak{' '}
          <Text style={styles.termsLink} onPress={() => router.push('/terms')}>Kullanım Koşulları</Text>
          {' '}ve{' '}
          <Text style={styles.termsLink} onPress={() => router.push('/privacy')}>Gizlilik Politikası</Text>
          'nı kabul etmiş olursunuz.
        </Text>

        {/* Pay Button */}
        <Button
          mode="contained"
          onPress={handlePayment}
          loading={loading}
          disabled={loading || !cardNumber || !cardExpiry || !cardCvc || !cardName}
          style={styles.payButton}
          buttonColor={tier.color}
        >
          {loading ? 'İşleniyor...' : `₺${(tier.price * 1.2).toFixed(2)} Öde`}
        </Button>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
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
  content: {
    flex: 1,
    padding: 16,
  },
  planCard: {
    marginBottom: 24,
    borderWidth: 2,
    backgroundColor: TarodanColors.background,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 4,
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: 'normal',
    color: TarodanColors.textSecondary,
  },
  popularBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  featuresCompact: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    marginLeft: 8,
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  moreFeatures: {
    marginLeft: 24,
    fontSize: 13,
    color: TarodanColors.textSecondary,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  paymentCard: {
    marginBottom: 24,
    backgroundColor: TarodanColors.background,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentOptionText: {
    marginLeft: 8,
    fontSize: 15,
    color: TarodanColors.textPrimary,
  },
  cardForm: {
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  summaryCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: TarodanColors.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  terms: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  termsLink: {
    color: TarodanColors.primary,
    textDecorationLine: 'underline',
  },
  payButton: {
    borderRadius: 12,
    paddingVertical: 4,
  },
});
