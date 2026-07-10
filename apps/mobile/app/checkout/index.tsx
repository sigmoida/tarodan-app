import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Snackbar, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenHeader } from '@/components/common';
import { formatPrice } from '@/utils/format';
import { styles } from './_lib/styles';
import { useCheckout } from './_hooks/useCheckout';
import { CheckoutProgress } from './_components/CheckoutProgress';
import { Step1Address, Step2Payment, Step3Confirm } from './_components/CheckoutSteps';
import { OrderSummary } from './_components/OrderSummary';
import { OtpModal } from './_modals/OtpModal';

const { colors } = theme;

export default function CheckoutScreen() {
  const c = useCheckout();

  if (c.items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={80} color={colors.text.muted} />
        <Text style={styles.emptyTitle}>Sepetiniz Boş</Text>
        <Text style={styles.emptySubtitle}>Ödeme yapabilmek için sepetinize ürün ekleyin</Text>
        <Button
          variant="primary"
          title="Alışverişe Başla"
          onPress={() => router.replace('/' as any)}
          style={{ marginTop: 20, alignSelf: 'center' }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        title={c.step === 1 ? 'Teslimat Bilgileri' : c.step === 2 ? 'Ödeme' : 'Sipariş Onayı'}
        onBack={() => (c.step > 1 ? c.setStep(c.step - 1) : router.back())}
      />

      <CheckoutProgress step={c.step} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {c.step === 1 ? <Step1Address c={c} /> : null}
        {c.step === 2 ? <Step2Payment c={c} /> : null}
        {c.step === 3 ? <Step3Confirm c={c} /> : null}

        <OrderSummary
          itemCount={c.items.length}
          subtotal={c.subtotal}
          shippingCost={c.shippingCost}
          effectiveShippingCity={c.effectiveShippingCity}
          buyerFee={c.buyerFee}
          taxAmount={c.taxAmount}
          total={c.total}
        />

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        {c.step < 3 ? (
          <Button
            variant="primary"
            title="Devam Et"
            onPress={c.handleNextStep}
            icon="arrow-forward"
            iconPosition="right"
            style={{ ...styles.actionButton, ...styles.continueButton }}
          />
        ) : (
          <Button
            variant="primary"
            title={c.loading ? 'İşleniyor...' : `Onayla ve Öde (${formatPrice(c.total)})`}
            onPress={c.handleCheckout}
            isLoading={c.loading}
            disabled={c.loading}
            fullWidth
            style={styles.actionButton}
            icon="card-outline"
          />
        )}
      </View>

      <Snackbar visible={c.snackbar.visible} onDismiss={c.dismissSnackbar} duration={3000} variant="danger">
        {c.snackbar.message}
      </Snackbar>

      <OtpModal
        visible={c.otpModalOpen}
        onClose={c.closeOtpModal}
        email={c.guestEmail.trim().toLowerCase()}
        otpCode={c.otpCode}
        setOtpCode={c.setOtpCode}
        otpError={c.otpError}
        otpExpiresIn={c.otpExpiresIn}
        otpSending={c.otpSending}
        loading={c.loading}
        onSubmit={c.handleOtpSubmit}
        onResend={c.handleOtpResend}
      />
    </KeyboardAvoidingView>
  );
}
