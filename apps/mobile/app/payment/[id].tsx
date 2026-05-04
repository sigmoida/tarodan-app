import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, BackHandler } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { paymentsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, ErrorState, Text } from '../../src/components/common';

/**
 * Ödeme WebView ekranı.
 *
 * Akış:
 *   1. Checkout ekranı sipariş oluşturur ve paymentId'yi elde eder.
 *   2. router.push('/payment/<paymentId>?orderId=...&provider=paytr|iyzico&guest=0|1')
 *   3. Bu ekran ilgili provider için initiate çağırıp dönen HTML/URL'yi WebView'e verir.
 *   4. Provider, 3DS işlemi bitince kendi callback URL'ine GET/POST yapar.
 *      WebView navigation değişikliklerini dinleriz; callback URL tespit edilince
 *      `/payment/success` veya `/payment/fail`'a yönlendiririz.
 *   5. Kullanıcı geri tuşuna bastığında "emin misin?" sor, evet derse ödemeyi cancel et.
 */
export default function PaymentWebViewScreen() {
  const params = useLocalSearchParams<{
    id: string;
    orderId?: string;
    provider?: 'paytr' | 'iyzico';
    guest?: string;
    tradeCash?: string;
  }>();

  const paymentId = params.id!;
  const provider = (params.provider as 'paytr' | 'iyzico') || 'iyzico';
  const isGuest = params.guest === '1';
  const isTradeCash = params.tradeCash === '1';

  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    html: string | null;
    url: string | null;
  }>({ loading: true, error: null, html: null, url: null });

  const webviewRef = useRef<WebView>(null);
  const resolvedRef = useRef(false);

  // Back handler — ödeme süreci içinde kazara çıkışı engelle
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
    initiatePayment();
  }, [paymentId]);

  const initiatePayment = async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }));
      let response: any;

      if (isTradeCash) {
        // Takas nakit farkı
        response = await paymentsApi.initiateTradeCash(paymentId);
      } else if (isGuest && params.orderId) {
        response = await paymentsApi.initiateGuest(params.orderId, provider);
      } else if (params.orderId) {
        response = await paymentsApi.initiate(params.orderId, provider);
      } else {
        // paymentId ile initiate — retry akışı
        response = await paymentsApi.retry(paymentId);
      }

      const data = response?.data?.data ?? response?.data ?? {};
      // API şu alanlardan birini dönebilir
      const html: string | undefined = data.paymentPageHtml || data.iframeHtml || data.html;
      const url: string | undefined = data.paymentPageUrl || data.redirectUrl || data.url;

      if (html) {
        setState({ loading: false, error: null, html, url: null });
      } else if (url) {
        setState({ loading: false, error: null, html: null, url });
      } else {
        setState({
          loading: false,
          error: 'Ödeme sayfası açılamadı. Lütfen tekrar deneyin.',
          html: null,
          url: null,
        });
      }
    } catch (e: any) {
      setState({
        loading: false,
        error: e?.response?.data?.message || 'Ödeme başlatılamadı.',
        html: null,
        url: null,
      });
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Ödemeyi İptal Et',
      'Ödeme işlemini iptal etmek istediğinize emin misiniz? Bu işlem sepetinizdeki rezervasyonu serbest bırakır.',
      [
        { text: 'Devam Et', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: async () => {
            try {
              await paymentsApi.cancel(paymentId);
            } catch {
              // cancel başarısız olsa bile UI'ı geri al
            }
            router.back();
          },
        },
      ],
    );
  };

  const handleNavigationChange = (nav: WebViewNavigation) => {
    if (resolvedRef.current) return;
    const url = nav.url || '';

    // Provider callback URL pattern'lerini yakala.
    // İki tür var:
    //   A) Backend, provider callback'i aldıktan sonra bizim uygulamamızın /payment-result sayfasına yönlendirir.
    //   B) Provider doğrudan bizim /api/payment/callback/... endpoint'imize gider.
    // Her ikisi için de query parametrelerindeki `status` / `paymentId`'yi okuyup yönlendirme yaparız.
    const lower = url.toLowerCase();

    const isSuccessMarker =
      lower.includes('/payment/success') ||
      lower.includes('status=success') ||
      lower.includes('result=success') ||
      lower.includes('payment_status=paid');

    const isFailMarker =
      lower.includes('/payment/fail') ||
      lower.includes('/payment/failure') ||
      lower.includes('status=fail') ||
      lower.includes('status=error') ||
      lower.includes('result=fail');

    if (isSuccessMarker) {
      resolvedRef.current = true;
      router.replace({ pathname: '/payment/success', params: { paymentId, guest: params.guest } } as any);
    } else if (isFailMarker) {
      resolvedRef.current = true;
      router.replace({ pathname: '/payment/fail', params: { paymentId, guest: params.guest } } as any);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Güvenli Ödeme"
        subtitle={provider === 'paytr' ? 'PayTR' : 'iyzico'}
        onBack={handleCancel}
      />

      <View style={styles.safeNotice}>
        <Ionicons name="lock-closed" size={14} color={TarodanColors.success} />
        <Text style={styles.safeNoticeText}>
          Bu sayfa SSL şifrelemeyle korunmaktadır. Kart bilgileriniz Tarodan'a iletilmez.
        </Text>
      </View>

      {state.loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Ödeme sayfası hazırlanıyor...</Text>
        </View>
      ) : state.error ? (
        <View style={styles.errorWrap}>
          <ErrorState message={state.error} onRetry={initiatePayment} />
          <Button mode="text" onPress={() => router.back()} textColor={TarodanColors.textSecondary}>
            Geri Dön
          </Button>
        </View>
      ) : state.html ? (
        <WebView
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ html: state.html }}
          onNavigationStateChange={handleNavigationChange}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={TarodanColors.primary} />
            </View>
          )}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          mixedContentMode="compatibility"
        />
      ) : state.url ? (
        <WebView
          ref={webviewRef}
          source={{ uri: state.url }}
          onNavigationStateChange={handleNavigationChange}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={TarodanColors.primary} />
            </View>
          )}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          mixedContentMode="compatibility"
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  safeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: TarodanColors.successLight,
  },
  safeNoticeText: {
    flex: 1,
    fontSize: 12,
    color: TarodanColors.success,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: TarodanColors.textSecondary,
  },
  errorWrap: {
    flex: 1,
    paddingVertical: 16,
  },
});
