import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { Button, Spinner, Text, theme, appAlert } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { paymentsApi } from '@/services/api';
import { ScreenHeader, ErrorState } from '@/components/common';
import { captureException } from '@/services/sentry';
import CardPaymentForm from '@/components/CardPaymentForm';

const { colors } = theme;

/**
 * Ödeme ekranı — TEK ödeme yüzeyi (iframe/WebView ödeme akışı kaldırıldı).
 * Misafir + üye aynı PayTR Direct API kart formunu kullanır.
 *
 * Akış:
 *   1. Çağıran ekran (checkout/üyelik/takas) sipariş/grup/takas oluşturup paymentId elde eder.
 *   2. router.push('/payment/<paymentId>?guest=0|1&type=...')
 *   3. Bu ekran ödeme durumunu yükler; tamamlandıysa/başarısızsa yönlendirir, aksi halde
 *      hedefi (orderId/checkoutGroupId/tradeId) türetip CardPaymentForm'u gösterir.
 *   4. Yeni kart 3D Secure HTML'i CardPaymentForm içindeki WebView'de render edilir (meşru).
 *   5. PAYMENT_BYPASS (dev) açıksa kart formu yerine ödeme anında tamamlanır.
 */
export default function PaymentScreen() {
  const params = useLocalSearchParams<{
    id: string;
    guest?: string;
    /** Üyelik ödemesi: başarı → /membership/success */
    type?: string;
    /** Üyelik kademesi (basic|premium|business) — success ekranına taşınır. */
    tier?: string;
    /** Takas nakit farkı ödemesi: başarı → /trade/{tradeId} */
    tradeId?: string;
    tradeCash?: string;
  }>();

  const paymentId = params.id!;
  const isGuest = params.guest === '1';
  const isMembership = params.type === 'membership';

  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    target: { orderId?: string; checkoutGroupId?: string; tradeId?: string } | null;
    amount?: number;
    recurringEnabled: boolean;
  }>({ loading: true, error: null, target: null, recurringEnabled: false });

  const resolvedRef = useRef(false);

  // Back handler — ödeme süreci içinde kazara çıkışı engelle.
  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        handleCancel();
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, []),
  );

  useEffect(() => {
    load();
    // ödeme durumu yalnızca paymentId değişince yeniden yüklenir
  }, [paymentId]);

  const load = async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }));

      // Public ödeme yapılandırması (bypass + kayıtlı kart/oto-yenileme).
      let cfg = { bypassEnabled: false, recurringEnabled: false };
      try {
        cfg = ((await paymentsApi.getConfig()).data) as any;
      } catch {
        /* config alınamazsa güvenli varsayılan: yalnız yeni-kart, bypass kapalı */
      }

      // Ödeme durumunu yükle (hedef + tutar + tamamlandı/başarısız kontrolü).
      const res: any = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId)
        : await paymentsApi.getStatusLight(paymentId);
      const data = res?.data?.data ?? res?.data ?? {};

      if (data.status === 'completed') {
        routeToSuccess();
        return;
      }
      if (data.status === 'failed') {
        routeToFail();
        return;
      }

      // PAYMENT_BYPASS (dev/test): kart formu anlamsız — ödemeyi anında tamamla.
      if (cfg.bypassEnabled && data.status === 'pending') {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        try {
          await paymentsApi.bypassComplete(paymentId);
        } catch (bypassErr: any) {
          captureException(bypassErr, {
            level: 'error',
            tags: { flow: 'payment.bypassComplete' },
            extra: { paymentId },
          });
        }
        routeToSuccess();
        return;
      }

      // Hedef status'tan türetilir; tradeId status'ta yoksa param'dan tamamla (yedek).
      const target = {
        ...(data.orderId ? { orderId: String(data.orderId) } : {}),
        ...(data.checkoutGroupId ? { checkoutGroupId: String(data.checkoutGroupId) } : {}),
        ...(data.tradeId
          ? { tradeId: String(data.tradeId) }
          : params.tradeId
            ? { tradeId: String(params.tradeId) }
            : {}),
      };
      const hasTarget = !!(target.orderId || target.checkoutGroupId || target.tradeId);
      if (!hasTarget) {
        setState({
          loading: false,
          error: 'Ödeme hedefi bulunamadı. Lütfen tekrar deneyin.',
          target: null,
          recurringEnabled: false,
        });
        return;
      }

      setState({
        loading: false,
        error: null,
        target,
        amount: data.amount != null ? Number(data.amount) : undefined,
        // Kayıtlı kart yalnız giriş yapmış kullanıcıya gösterilir.
        recurringEnabled: !!cfg.recurringEnabled && !isGuest,
      });
    } catch (e: any) {
      captureException(e, {
        level: 'error',
        tags: { flow: 'payment.load' },
        extra: { paymentId, status: e?.response?.status },
      });
      setState({
        loading: false,
        error: e?.response?.data?.message || 'Ödeme bilgisi yüklenemedi.',
        target: null,
        recurringEnabled: false,
      });
    }
  };

  // Geri git; stack kökündeysek ana sayfaya düş.
  const safeBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  };

  const handleCancel = () => {
    // Geri çıkış siparişi İPTAL ETMEZ — sadece ödeme ekranından çıkar. Sipariş
    // "ödeme bekliyor" kalır; kullanıcı sonra tekrar ödeyebilir. Cron terk edileni temizler.
    appAlert(
      'Ödemeden Çık',
      'Ödemeyi tamamlamadan çıkmak istediğinize emin misiniz? Siparişiniz "ödeme bekliyor" olarak kalır; daha sonra tekrar ödeyebilirsiniz.',
      [
        { text: 'Ödemeye Devam Et', style: 'cancel' },
        { text: 'Çık', onPress: () => safeBack() },
      ],
    );
  };

  const routeToSuccess = (pid: string = paymentId) => {
    if (isMembership) {
      router.replace({
        pathname: '/membership/success',
        params: { paymentId: pid, ...(params.tier ? { tier: params.tier } : {}) },
      } as any);
    } else {
      router.replace({
        pathname: '/payment/success',
        params: {
          paymentId: pid,
          guest: params.guest,
          tradeCash: params.tradeCash,
          tradeId: params.tradeId,
        },
      } as any);
    }
  };

  const routeToFail = (pid: string = paymentId) => {
    router.replace({ pathname: '/payment/fail', params: { paymentId: pid, guest: params.guest } } as any);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Güvenli Ödeme" subtitle="PayTR" onBack={handleCancel} />

      {state.loading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>Ödeme hazırlanıyor...</Text>
        </View>
      ) : state.error ? (
        <View style={styles.errorWrap}>
          <ErrorState message={state.error} onRetry={load} />
          <Button variant="ghost" title="Geri Dön" onPress={safeBack} style={{ alignSelf: 'center' }} />
        </View>
      ) : state.target ? (
        <View style={{ flex: 1 }}>
          <View style={styles.safeNotice}>
            <Ionicons name="lock-closed" size={14} color={colors.success[600]!} />
            <Text style={styles.safeNoticeText}>
              Bu sayfa SSL şifrelemeyle korunmaktadır. Kart bilgileriniz Tarodan'a iletilmez.
            </Text>
          </View>
          <CardPaymentForm
            target={state.target}
            amount={state.amount}
            recurringEnabled={state.recurringEnabled}
            isGuest={isGuest}
            paymentId={paymentId}
            onSuccess={(pid) => routeToSuccess(pid)}
            onFail={() => routeToFail()}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  safeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.success[50]!,
  },
  safeNoticeText: {
    flex: 1,
    fontSize: 12,
    color: colors.success[600]!,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
  },
  errorWrap: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
});
