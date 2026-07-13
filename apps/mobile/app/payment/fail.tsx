import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Spinner, Text, theme } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { paymentsApi } from '@/services/api';

const { colors } = theme;

interface PaymentInfo {
  id: string;
  orderId?: string;
  tradeId?: string;
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
  // Takas nakit farkı ödemesi: sipariş yerine takas detayına dönülür.
  const tradeId = info?.tradeId;
  const reason = queryError || info?.failureReason || 'Ödemeniz tamamlanamadı.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.iconWrap}>
          <Ionicons name="close-circle" size={96} color={colors.danger[600]!} />
        </View>

        <Text style={styles.title}>Ödeme Başarısız</Text>
        <Text style={styles.subtitle}>{reason}</Text>

        {loading ? (
          <View style={{ marginTop: theme.spacing[6] }}>
            <Spinner size="md" />
          </View>
        ) : null}

        <View style={styles.hintCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info[600]!} />
          <Text style={styles.hintText}>
            Hesabınızdan bir tahsilat yapılmadı. Tekrar deneyebilir veya farklı bir ödeme yöntemi seçebilirsiniz.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            variant="primary"
            title="Tekrar Dene"
            fullWidth
            onPress={handleRetry}
            isLoading={retrying}
            disabled={retrying || !paymentId}
            style={styles.btn}
          />
          {tradeId ? (
            <Button
              variant="outline"
              title="Takasa Dön"
              fullWidth
              onPress={() => router.replace(`/trade/${tradeId}` as any)}
              style={styles.btn}
            />
          ) : orderId && guest !== '1' ? (
            <Button
              variant="outline"
              title="Sipariş Detayına Git"
              fullWidth
              onPress={() => router.replace(`/orders/${orderId}` as any)}
              style={styles.btn}
            />
          ) : null}
          <Button
            variant="ghost"
            title="Ana Sayfaya Dön"
            fullWidth
            onPress={() => router.replace('/')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  scrollBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    gap: theme.spacing[2.5],
  },
  iconWrap: {
    marginBottom: theme.spacing[2],
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text.heading,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  hintCard: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    alignItems: 'flex-start',
    width: '100%',
    backgroundColor: colors.info[50]!,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: colors.info[600]!,
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    marginTop: theme.spacing[6],
    gap: theme.spacing[2.5],
  },
  btn: {
    borderRadius: theme.radius['2xl'],
  },
});
