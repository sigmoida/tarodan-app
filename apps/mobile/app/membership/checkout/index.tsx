import { View, ScrollView } from 'react-native';
import { Button, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { useMembershipCheckout } from './_hooks/useMembershipCheckout';
import { styles } from './_lib/styles';
import { formatTL } from './_lib/tiers';
import {
  PlanCard,
  PaymentMethodCard,
  OrderSummary,
  CheckoutTerms,
} from './_components/CheckoutSections';

export default function MembershipCheckoutScreen() {
  const f = useMembershipCheckout();

  if (!f.isAuthenticated) return null;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Üyelik Satın Al"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <PlanCard f={f} />
        <PaymentMethodCard />
        <OrderSummary f={f} />
        <CheckoutTerms />

        <Button
          variant="primary"
          title={f.loading ? 'İşleniyor...' : `₺${formatTL(f.displayPrice)} Öde`}
          onPress={f.handlePayment}
          isLoading={f.loading}
          disabled={f.loading}
          fullWidth
          style={styles.payButton}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
