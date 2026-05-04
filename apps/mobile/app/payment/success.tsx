import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, ActivityIndicator } from 'react-native-paper';
import { Text } from '../../src/components/common';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { paymentsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { formatPrice } from '../../src/utils/format';

interface PaymentInfo {
  id: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  order?: { id: string; orderNumber?: string };
}

export default function PaymentSuccessScreen() {
  const { paymentId, guest } = useLocalSearchParams<{ paymentId: string; guest?: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<PaymentInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!paymentId) { setLoading(false); return; }
      try {
        const response = guest === '1'
          ? await paymentsApi.getStatusLightGuest(paymentId)
          : await paymentsApi.getStatus(paymentId);
        setInfo(response.data?.data ?? response.data ?? null);
      } catch {
        // Sessiz — success sayfasında hata kritik değil
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [paymentId, guest]);

  const orderId = info?.order?.id || info?.orderId;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={96} color={TarodanColors.success} />
        </View>

        <Text style={styles.title}>Ödemeniz Başarılı!</Text>
        <Text style={styles.subtitle}>
          Siparişiniz alındı. Detayları e-posta adresinize gönderdik.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={TarodanColors.primary} />
        ) : info ? (
          <View style={styles.summaryCard}>
            {info.order?.orderNumber ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Sipariş No</Text>
                <Text style={styles.summaryValue}>{info.order.orderNumber}</Text>
              </View>
            ) : null}
            {info.amount ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tutar</Text>
                <Text style={[styles.summaryValue, { color: TarodanColors.primary, fontSize: 18 }]}>
                  {formatPrice(info.amount)}
                </Text>
              </View>
            ) : null}
            {info.status ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Durum</Text>
                <Text style={[styles.summaryValue, { color: TarodanColors.success }]}>
                  {info.status === 'paid' ? 'Ödendi' : info.status}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          {orderId && guest !== '1' ? (
            <Button
              mode="contained"
              buttonColor={TarodanColors.primary}
              icon="receipt"
              onPress={() => router.replace(`/orders/${orderId}` as any)}
              style={styles.btn}
            >
              Siparişimi Gör
            </Button>
          ) : null}
          <Button
            mode="outlined"
            textColor={TarodanColors.primary}
            onPress={() => router.replace('/')}
            style={[styles.btn, { borderColor: TarodanColors.primary }]}
          >
            Ana Sayfaya Dön
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  scrollBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  iconWrap: {
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
    padding: 16,
    marginTop: 16,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  actions: {
    width: '100%',
    marginTop: 24,
    gap: 10,
  },
  btn: {
    borderRadius: 10,
  },
});
