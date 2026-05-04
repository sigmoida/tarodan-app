import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, ActivityIndicator } from 'react-native-paper';
import { Text } from '../../src/components/common';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { paymentsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';

interface PaymentInfo {
  id: string;
  orderId?: string;
  order?: { id: string; orderNumber?: string };
  failureReason?: string;
  errorCode?: string;
  status?: string;
}

export default function PaymentFailScreen() {
  const { paymentId, guest, error: queryError } = useLocalSearchParams<{
    paymentId: string;
    guest?: string;
    error?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!paymentId) { setLoading(false); return; }
      try {
        // Rezervasyonu serbest bırak
        await paymentsApi.confirmFailed(paymentId).catch(() => null);
        const response = guest === '1'
          ? await paymentsApi.getStatusLightGuest(paymentId)
          : await paymentsApi.getStatus(paymentId);
        setInfo(response.data?.data ?? response.data ?? null);
      } catch {
        // Sessiz
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [paymentId, guest]);

  const handleRetry = async () => {
    if (!paymentId) return;
    try {
      setRetrying(true);
      await paymentsApi.retry(paymentId);
      router.replace({ pathname: '/payment/[id]', params: { id: paymentId, guest } } as any);
    } catch (e: any) {
      setRetrying(false);
      // Alert gerekirse burada gösterilebilir; basit tutuyoruz.
    }
  };

  const orderId = info?.order?.id || info?.orderId;
  const reason = queryError || info?.failureReason || 'Ödemeniz tamamlanamadı.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.iconWrap}>
          <Ionicons name="close-circle" size={96} color={TarodanColors.error} />
        </View>

        <Text style={styles.title}>Ödeme Başarısız</Text>
        <Text style={styles.subtitle}>{reason}</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={TarodanColors.primary} />
        ) : null}

        <View style={styles.hintCard}>
          <Ionicons name="information-circle-outline" size={18} color={TarodanColors.info} />
          <Text style={styles.hintText}>
            Hesabınızdan bir tahsilat yapılmadı. Tekrar deneyebilir veya farklı bir ödeme yöntemi seçebilirsiniz.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            icon="refresh"
            onPress={handleRetry}
            loading={retrying}
            disabled={retrying || !paymentId}
            style={styles.btn}
          >
            Tekrar Dene
          </Button>
          {orderId && guest !== '1' ? (
            <Button
              mode="outlined"
              textColor={TarodanColors.primary}
              onPress={() => router.replace(`/orders/${orderId}` as any)}
              style={[styles.btn, { borderColor: TarodanColors.primary }]}
            >
              Sipariş Detayına Git
            </Button>
          ) : null}
          <Button
            mode="text"
            textColor={TarodanColors.textSecondary}
            onPress={() => router.replace('/')}
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
  hintCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    width: '100%',
    backgroundColor: TarodanColors.infoLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.info,
    lineHeight: 18,
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
