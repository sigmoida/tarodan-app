/**
 * Checkout Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useCartStore } from '../../stores/cartStore';
import api from '../../services/api';

const PAYMENT_METHODS = [{ id: 'paytr', name: 'PayTR', icon: 'card' }];

const CheckoutScreen = ({ navigation }: any) => {
  const { items, total, clearCart } = useCartStore();
  const [step, setStep] = useState(1); // 1: Address, 2: Payment
  const [isLoading, setIsLoading] = useState(false);
  
  // Address form
  const [address, setAddress] = useState({
    fullName: '',
    phone: '',
    city: '',
    district: '',
    addressLine: '',
    zipCode: '',
  });
  
  // Payment
  const [paymentMethod, setPaymentMethod] = useState('paytr');

  const validateAddress = () => {
    const { fullName, phone, city, district, addressLine } = address;
    if (!fullName.trim() || !phone.trim() || !city.trim() || !district.trim() || !addressLine.trim()) {
      Alert.alert('Hata', 'Tüm adres alanlarını doldurun');
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    if (validateAddress()) {
      setStep(2);
    }
  };

  const handlePayment = async () => {
    setIsLoading(true);
    
    try {
      // Create order
      const orderResponse = await api.createOrder({
        items: items.map((item) => ({
          listing_id: item.listing_id,
          quantity: item.quantity,
        })),
        shipping_address: address,
      });

      // Initiate payment
      const paymentResponse = await api.initiatePayment(
        orderResponse.order.id,
        paymentMethod as 'paytr'
      );

      // Handle payment redirect or webview
      // For now, simulate success
      Alert.alert(
        'Sipariş Alındı',
        'Siparişiniz başarıyla oluşturuldu. Ödeme sayfasına yönlendiriliyorsunuz.',
        [
          {
            text: 'Tamam',
            onPress: () => {
              clearCart();
              navigation.navigate('Main', {
                screen: 'Profile',
                params: {
                  screen: 'MyOrders',
                },
              });
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert('Hata', 'Sipariş oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  };

  const shippingCost = 49.90;
  const grandTotal = total + shippingCost;

  return (
    <View style={styles.container}>
      {/* Progress Steps */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressStep, step >= 1 && styles.progressStepActive]}>
          <Text style={[styles.progressStepText, step >= 1 && styles.progressStepTextActive]}>1</Text>
        </View>
        <View style={[styles.progressLine, step >= 2 && styles.progressLineActive]} />
        <View style={[styles.progressStep, step >= 2 && styles.progressStepActive]}>
          <Text style={[styles.progressStepText, step >= 2 && styles.progressStepTextActive]}>2</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {step === 1 ? (
          // Address Step
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Teslimat Adresi</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ad Soyad</Text>
              <TextInput
                style={styles.input}
                placeholder="Ad Soyad"
                value={address.fullName}
                onChangeText={(v) => setAddress({ ...address, fullName: v })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Telefon</Text>
              <TextInput
                style={styles.input}
                placeholder="05XX XXX XX XX"
                value={address.phone}
                onChangeText={(v) => setAddress({ ...address, phone: v })}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>İl</Text>
                <TextInput
                  style={styles.input}
                  placeholder="İl"
                  value={address.city}
                  onChangeText={(v) => setAddress({ ...address, city: v })}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>İlçe</Text>
                <TextInput
                  style={styles.input}
                  placeholder="İlçe"
                  value={address.district}
                  onChangeText={(v) => setAddress({ ...address, district: v })}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Adres</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Mahalle, sokak, bina no, daire no..."
                value={address.addressLine}
                onChangeText={(v) => setAddress({ ...address, addressLine: v })}
                multiline
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Posta Kodu (Opsiyonel)</Text>
              <TextInput
                style={styles.input}
                placeholder="34000"
                value={address.zipCode}
                onChangeText={(v) => setAddress({ ...address, zipCode: v })}
                keyboardType="numeric"
              />
            </View>
          </View>
        ) : (
          // Payment Step
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Ödeme Yöntemi</Text>

            {PAYMENT_METHODS.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.paymentOption,
                  paymentMethod === method.id && styles.paymentOptionActive,
                ]}
                onPress={() => setPaymentMethod(method.id)}
              >
                <Icon
                  name={method.icon as any}
                  size={24}
                  color={paymentMethod === method.id ? '#E53935' : '#757575'}
                />
                <Text
                  style={[
                    styles.paymentOptionText,
                    paymentMethod === method.id && styles.paymentOptionTextActive,
                  ]}
                >
                  {method.name}
                </Text>
                {paymentMethod === method.id && (
                  <Icon name="checkmark-circle" size={24} color="#E53935" />
                )}
              </TouchableOpacity>
            ))}

            {/* Order Summary */}
            <View style={styles.orderSummary}>
              <Text style={styles.summaryTitle}>Sipariş Özeti</Text>
              
              {items.map((item) => (
                <View key={item.id} style={styles.summaryItem}>
                  <Text style={styles.summaryItemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.summaryItemPrice}>
                    ₺{item.price?.toLocaleString('tr-TR')}
                  </Text>
                </View>
              ))}

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Ara Toplam</Text>
                <Text style={styles.summaryValue}>₺{total.toLocaleString('tr-TR')}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Kargo</Text>
                <Text style={styles.summaryValue}>₺{shippingCost.toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>Toplam</Text>
                <Text style={styles.totalValue}>₺{grandTotal.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        {step === 1 ? (
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Devam Et</Text>
            <Icon name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <View>
            <View style={styles.totalRow}>
              <Text style={styles.bottomTotalLabel}>Toplam</Text>
              <Text style={styles.bottomTotalValue}>₺{grandTotal.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.payButton, isLoading && styles.payButtonDisabled]}
              onPress={handlePayment}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Icon name="lock-closed" size={20} color="#FFF" />
                  <Text style={styles.payButtonText}>Güvenli Ödeme</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  progressStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressStepActive: {
    backgroundColor: '#E53935',
  },
  progressStepText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
  },
  progressStepTextActive: {
    color: '#FFF',
  },
  progressLine: {
    width: 60,
    height: 3,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: '#E53935',
  },
  stepContent: {
    padding: 16,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212121',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputRow: {
    flexDirection: 'row',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  paymentOptionActive: {
    borderColor: '#E53935',
    backgroundColor: '#FFF3F3',
  },
  paymentOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#424242',
    marginLeft: 12,
  },
  paymentOptionTextActive: {
    color: '#E53935',
    fontWeight: '600',
  },
  orderSummary: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryItemTitle: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    marginRight: 12,
  },
  summaryItemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#757575',
  },
  summaryValue: {
    fontSize: 14,
    color: '#212121',
  },
  summaryTotal: {
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E53935',
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E53935',
    borderRadius: 12,
    paddingVertical: 16,
  },
  continueButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bottomTotalLabel: {
    fontSize: 16,
    color: '#757575',
  },
  bottomTotalValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E53935',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
  },
  payButtonDisabled: {
    opacity: 0.7,
  },
  payButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default CheckoutScreen;


