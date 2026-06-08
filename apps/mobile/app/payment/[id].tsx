import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert, BackHandler } from 'react-native';
import { Button, Spinner, Text, theme } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { paymentsApi } from '../../src/services/api';
import { ScreenHeader, ErrorState } from '../../src/components/common';
import { captureException } from '../../src/services/sentry';

const { colors } = theme;

/**
 * Ödeme WebView ekranı.
 *
 * Akış:
 *   1. Checkout ekranı sipariş oluşturur ve paymentId'yi elde eder.
 *   2. router.push('/payment/<paymentId>?orderId=...&provider=paytr&guest=0|1')
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
    provider?: 'paytr';
    guest?: string;
    tradeCash?: string;
    bypass?: string;
    /**
     * Çağıran ekran ödemeyi zaten başlatıp PayTR URL'ini geçtiyse burada gelir.
     * Bu durumda ekran tekrar initiate ETMEZ — gelen URL'i doğrudan yükler.
     * (Çift token üretimini önler; PayTR token'ları tek kullanımlıktır.)
     */
    paymentUrl?: string;
    /** Üyelik ödemesi: başarı → /membership/success */
    type?: string;
    /** Takas nakit farkı ödemesi: başarı → /trade/{tradeId} */
    tradeId?: string;
  }>();

  // params.id genelde gerçek paymentId'dir; fallback initiate yapıldığında
  // backend'in döndürdüğü paymentId ile güncellenir (cancel/verify/success için).
  const paymentIdRef = useRef<string>(params.id!);
  // Sadece PayTR kullanılıyor (iyzico kaldırıldı — web ile parite)
  const provider: 'paytr' = 'paytr';
  const isGuest = params.guest === '1';
  const isMembership = params.type === 'membership';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, params.paymentUrl]);

  const initiatePayment = async () => {
    try {
      setState(s => ({ ...s, loading: true, error: null }));

      // 1) Çağıran ekran ödemeyi zaten başlatıp PayTR URL'ini geçtiyse: doğrudan yükle.
      //    Tekrar initiate edilmez → boşa/çakışan token üretilmez.
      if (params.paymentUrl) {
        setState({ loading: false, error: null, html: null, url: params.paymentUrl });
        return;
      }

      // 2) Fallback: ekran kendisi initiate eder (deep link / kart 3DS fallback vb.).
      let response: any;
      if (isGuest && params.orderId) {
        response = await paymentsApi.initiateGuest(params.orderId, provider);
      } else if (params.orderId) {
        response = await paymentsApi.initiate(params.orderId, provider);
      } else {
        // orderId yok → mevcut ödeme için taze token (retry).
        response = await paymentsApi.retry(paymentIdRef.current);
      }

      const data = response?.data?.data ?? response?.data ?? {};

      // Backend gerçek paymentId döndürdüyse onu kullan (cancel/verify/success için).
      const returnedId = data.paymentId || data.id || data.payment?.id;
      if (returnedId) paymentIdRef.current = String(returnedId);

      // PAYMENT_BYPASS=true: API gerçek PayTR sayfası üretmez, useBypass döner.
      // Checkout normalde bu durumu kendi yakalar; defensive olarak burada da
      // yakalayıp bypass-complete tetikliyoruz, aksi halde WebView boş kalır.
      if (data.useBypass === true || params.bypass === '1') {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        try {
          await paymentsApi.bypassComplete(paymentIdRef.current);
        } catch (bypassErr: any) {
          captureException(bypassErr, {
            level: 'error',
            tags: { flow: 'payment.bypassComplete' },
            extra: { paymentId: paymentIdRef.current },
          });
        }
        routeToSuccess();
        return;
      }

      // Backend `paymentUrl`/`paymentHtml` döndürür (eski aliaslar geriye uyum için).
      const url: string | undefined =
        data.paymentUrl || data.paymentPageUrl || data.redirectUrl || data.url;
      const html: string | undefined =
        data.paymentHtml || data.paymentPageHtml || data.iframeHtml || data.html;

      // Mobilde URL'i tercih et: PayTR güvenli sayfasını doğrudan yüklemek, 3DS
      // yönlendirmelerini ana çerçevede tutar (HTML iframe sarması iç çerçevede
      // kalır ve onNavigation/onShouldStartLoad tetiklenmez → "webe atar").
      if (url) {
        setState({ loading: false, error: null, html: null, url });
      } else if (html) {
        setState({ loading: false, error: null, html, url: null });
      } else {
        setState({
          loading: false,
          error: 'Ödeme sayfası açılamadı. Lütfen tekrar deneyin.',
          html: null,
          url: null,
        });
      }
    } catch (e: any) {
      captureException(e, {
        level: 'error',
        tags: { flow: 'payment.initiate', provider: String(params.provider ?? 'unknown') },
        extra: { paymentId: paymentIdRef.current, status: e?.response?.status },
      });
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
              await paymentsApi.cancel(paymentIdRef.current);
            } catch {
              // cancel başarısız olsa bile UI'ı geri al
            }
            router.back();
          },
        },
      ],
    );
  };

  const routeToSuccess = () => {
    // Üyelik ödemesinde üyelik success ekranına, diğerlerinde ödeme success'e git.
    if (isMembership) {
      router.replace({ pathname: '/membership/success', params: { paymentId: paymentIdRef.current } } as any);
    } else {
      router.replace({
        pathname: '/payment/success',
        params: {
          paymentId: paymentIdRef.current,
          orderId: params.orderId,
          guest: params.guest,
          tradeCash: params.tradeCash,
          tradeId: params.tradeId,
        },
      } as any);
    }
  };

  const routeToFail = () => {
    router.replace({ pathname: '/payment/fail', params: { paymentId: paymentIdRef.current, guest: params.guest } } as any);
  };

  /**
   * PayTR ödeme sonrası `merchant_ok_url`/`merchant_fail_url` (web frontend)'e
   * yönlendirir. URL'i web sayfası YÜKLENMEDEN yakalayıp native success/fail
   * ekranına geçeriz. Hem onShouldStartLoadWithRequest (yükleme öncesi) hem de
   * onNavigationStateChange (yedek) bunu çağırır.
   *
   * @returns true → terminal URL (başarı/hata); WebView bu URL'i yüklemesin.
   */
  const resolveIfTerminal = (rawUrl: string): boolean => {
    if (resolvedRef.current) return true;
    const lower = (rawUrl || '').toLowerCase();

    const isSuccessMarker =
      lower.includes('/payment/success') ||
      lower.includes('/membership/success') ||
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
      // durum-sorgu ile sunucu tarafı tamamlamayı hızlandır (callback gecikse bile).
      paymentsApi.verify(paymentIdRef.current).catch(() => {});
      routeToSuccess();
      return true;
    }
    if (isFailMarker) {
      resolvedRef.current = true;
      routeToFail();
      return true;
    }
    return false;
  };

  // Yükleme öncesi: terminal URL'i web sayfası açılmadan kes.
  const handleShouldStartLoad = (req: { url: string }): boolean => !resolveIfTerminal(req.url);
  // Yedek: bazı durumlarda yalnız navigation state değişir.
  const handleNavigationChange = (nav: WebViewNavigation) => {
    resolveIfTerminal(nav.url || '');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Güvenli Ödeme"
        subtitle="PayTR"
        onBack={handleCancel}
      />

      <View style={styles.safeNotice}>
        <Ionicons name="lock-closed" size={14} color={colors.success[600]!} />
        <Text style={styles.safeNoticeText}>
          Bu sayfa SSL şifrelemeyle korunmaktadır. Kart bilgileriniz Tarodan'a iletilmez.
        </Text>
      </View>

      {state.loading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>Ödeme sayfası hazırlanıyor...</Text>
        </View>
      ) : state.error ? (
        <View style={styles.errorWrap}>
          <ErrorState message={state.error} onRetry={initiatePayment} />
          <Button variant="ghost" title="Geri Dön" onPress={() => router.back()} />
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
              <Spinner size="lg" />
            </View>
          )}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          mixedContentMode="compatibility"
          // PayTR 3DS adımı yeni pencere açabilir; Safari'ye düşmesin diye
          // aynı WebView içinde tut.
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
        />
      ) : state.url ? (
        <WebView
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ uri: state.url }}
          onNavigationStateChange={handleNavigationChange}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <Spinner size="lg" />
            </View>
          )}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          mixedContentMode="compatibility"
          // PayTR 3DS adımı yeni pencere açabilir; Safari'ye düşmesin diye
          // aynı WebView içinde tut.
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
        />
      ) : null}
    </SafeAreaView>
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
  },
});
