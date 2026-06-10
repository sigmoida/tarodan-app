import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Spinner, Text, theme } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../../src/services/api';
import { formatPrice } from '../../src/utils/format';

const { colors } = theme;

interface PaymentInfo {
  id: string;
  orderId?: string;
  tradeId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  order?: { id: string; orderNumber?: string };
}

export default function PaymentSuccessScreen() {
  const { paymentId, guest, tradeCash, tradeId } = useLocalSearchParams<{
    paymentId: string;
    guest?: string;
    tradeCash?: string;
    tradeId?: string;
  }>();
  const queryClient = useQueryClient();
  const isTrade = tradeCash === '1' || !!tradeId;
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<PaymentInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async (): Promise<PaymentInfo | null> => {
      const response = guest === '1'
        ? await paymentsApi.getStatusLightGuest(paymentId)
        : await paymentsApi.getStatus(paymentId);
      return response.data?.data ?? response.data ?? null;
    };

    const isTerminal = (s?: string) =>
      s === 'paid' || s === 'completed' || s === 'success' || s === 'hold_payment';

    const run = async () => {
      if (!paymentId) { setLoading(false); return; }

      // durum-sorgu (verify) ile sunucu tarafı tamamlamayı hemen tetikle —
      // PayTR callback'i gecikse bile ödeme/sipariş anında işlenir. Idempotent & public.
      try { await paymentsApi.verify(paymentId); } catch { /* best-effort */ }

      // Callback/verify işlenene kadar birkaç kez yokla.
      let last: PaymentInfo | null = null;
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        try {
          const data = await fetchStatus();
          last = data;
          if (!cancelled) setInfo(data);
          if (isTerminal(data?.status)) break;
        } catch {
          // Sessiz — success sayfasında hata kritik değil
        }
        if (attempt < 4 && !cancelled) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      if (cancelled) return;

      // Takas nakit farkı ödemesi: takasa dön + ilgili query'leri tazele (web ile parite).
      const tid = tradeId || last?.tradeId;
      if (isTrade && tid) {
        queryClient.invalidateQueries({ queryKey: ['trade'] });
        queryClient.invalidateQueries({ queryKey: ['trades'] });
        queryClient.invalidateQueries({ queryKey: ['trades-status-counts'] });
        router.replace(`/trade/${tid}` as any);
        return;
      }
      setLoading(false);
    };

    run();
    return () => { cancelled = true; };
  }, [paymentId, guest, isTrade, tradeId, queryClient]);

  const orderId = info?.order?.id || info?.orderId;
  const tid = tradeId || info?.tradeId;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={96} color={colors.success[600]!} />
        </View>

        <Text style={styles.title}>Ödemeniz Başarılı!</Text>
        <Text style={styles.subtitle}>
          {isTrade
            ? 'Nakit fark ödemesi alındı. Takas süreci başlıyor...'
            : 'Siparişiniz alındı. Detayları e-posta adresinize gönderdik.'}
        </Text>

        {loading ? (
          <View style={{ marginTop: 24 }}>
            <Spinner size="md" />
          </View>
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
                <Text style={[styles.summaryValue, { color: colors.primary[600]!, fontSize: 18 }]}>
                  {formatPrice(info.amount)}
                </Text>
              </View>
            ) : null}
            {info.status ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Durum</Text>
                <Text style={[styles.summaryValue, { color: colors.success[600]! }]}>
                  {info.status === 'paid' ? 'Ödendi' : info.status}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          {isTrade && tid ? (
            <Button
              variant="primary"
              title="Takasa Dön"
              fullWidth
              onPress={() => router.replace(`/trade/${tid}` as any)}
              style={styles.btn}
            />
          ) : orderId && guest !== '1' ? (
            <Button
              variant="primary"
              title="Siparişimi Gör"
              fullWidth
              onPress={() => router.replace(`/orders/${orderId}` as any)}
              style={styles.btn}
            />
          ) : null}
          <Button
            variant="outline"
            title="Ana Sayfaya Dön"
            fullWidth
            onPress={() => router.replace('/')}
            style={styles.btn}
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
    padding: 24,
    gap: 10,
  },
  iconWrap: {
    marginBottom: 8,
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
  summaryCard: {
    width: '100%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
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
    color: colors.text.muted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
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
