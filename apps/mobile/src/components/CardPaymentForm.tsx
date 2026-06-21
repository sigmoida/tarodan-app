import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Button, Input, Checkbox, Text, theme, appAlert } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { paymentsApi, membershipApi } from '../services/api';

const { colors } = theme;

/**
 * CardPaymentForm (mobil) — HİBRİT ödeme: giriş yapmış kullanıcı için PayTR Direct API.
 * Web CardPaymentForm paritesi.
 *  - Kayıtlı kart (Non3D recurring) veya yeni kart (3D → WebView) ile ödeme.
 *  - 410 (Direct kapalı) → onFallbackToWebView ile mevcut WebView/iframe akışına düşülür.
 * GÜVENLİK: kart no/CVV yalnız istekle PayTR'a gider; saklanmaz/loglanmaz.
 */

interface SavedCard {
  id: string;
  last4: string;
  brand: string | null;
  expMonth: string | null;
  expYear: string | null;
  requireCvv: boolean;
  isDefault: boolean;
  autoRenewEligible: boolean;
}

interface Props {
  target: { orderId?: string; checkoutGroupId?: string; tradeId?: string };
  amount?: number;
  onSuccess: (paymentId: string) => void;
  onFail?: () => void;
  onFallbackToWebView?: () => void;
}

const NEW_CARD = '__new__';

export default function CardPaymentForm({ target, amount, onSuccess, onFail, onFallbackToWebView }: Props) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [selected, setSelected] = useState<string>(NEW_CARD);
  const [processing, setProcessing] = useState(false);
  const [threeDSHtml, setThreeDSHtml] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const [holder, setHolder] = useState('');
  const [number, setNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvc, setCvc] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [savedCvv, setSavedCvv] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await membershipApi.listCards();
        const data: any = res.data;
        const list: SavedCard[] = Array.isArray(data) ? data : (data?.data ?? []);
        if (!alive) return;
        setCards(list);
        setSelected(list.length ? list[0].id : NEW_CARD);
      } catch {
        if (alive) setCards([]);
      } finally {
        if (alive) setLoadingCards(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedCard = useMemo(() => cards.find((c) => c.id === selected) || null, [cards, selected]);

  const digitsOnly = (v: string) => v.replace(/\D/g, '');

  function validateNewCard(): string | null {
    if (holder.trim().length < 2) return 'Kart üzerindeki ismi girin';
    const num = digitsOnly(number);
    if (num.length < 15 || num.length > 16) return 'Geçerli bir kart numarası girin';
    if (!/^\d{2}$/.test(expMonth) || Number(expMonth) < 1 || Number(expMonth) > 12)
      return 'Son kullanma ayı (AA) geçersiz';
    if (!/^\d{2}(\d{2})?$/.test(expYear)) return 'Son kullanma yılı (YY) geçersiz';
    if (!/^\d{3,4}$/.test(cvc)) return 'CVV geçersiz';
    return null;
  }

  async function submit() {
    if (processing) return;

    let body: any;
    if (selected === NEW_CARD) {
      const err = validateNewCard();
      if (err) {
        appAlert('Eksik bilgi', err);
        return;
      }
      body = {
        ...target,
        card: {
          cardHolderName: holder.trim(),
          cardNumber: digitsOnly(number),
          expireMonth: expMonth,
          expireYear: expYear,
          cvc,
        },
        saveCard,
      };
    } else {
      if (selectedCard?.requireCvv && !/^\d{3,4}$/.test(savedCvv)) {
        appAlert('CVV gerekli', 'Bu kart için CVV girin');
        return;
      }
      body = {
        ...target,
        savedCardId: selected,
        ...(selectedCard?.requireCvv ? { cvv: savedCvv } : {}),
      };
    }

    setProcessing(true);
    try {
      const res: any = await paymentsApi.processDirect(body);
      const data = res.data;
      setPaymentId(data.paymentId);

      if (data.threeDSHtml) {
        setThreeDSHtml(data.threeDSHtml); // 3D WebView göster
        return;
      }
      if (data.status === 'failed') {
        appAlert('Ödeme başarısız', data.reason || 'Ödeme tamamlanamadı');
        setProcessing(false);
        onFail?.();
        return;
      }
      onSuccess(data.paymentId);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 410 && onFallbackToWebView) {
        onFallbackToWebView();
        return;
      }
      appAlert('Hata', e?.response?.data?.message || 'Ödeme başlatılamadı');
      setProcessing(false);
    }
  }

  // 3D Secure: bankanın doğrulama sayfası; callback URL'ine ulaşınca sonuç.
  function onNav(nav: WebViewNavigation) {
    const url = (nav.url || '').toLowerCase();
    if (url.includes('/payment/success')) {
      if (paymentId) onSuccess(paymentId);
    } else if (url.includes('/payment/fail') || url.includes('/payment/failure')) {
      onFail?.();
    }
  }

  if (threeDSHtml) {
    return (
      <View style={styles.webviewWrap}>
        <WebView
          originWhitelist={['*']}
          source={{ html: threeDSHtml }}
          onNavigationStateChange={onNav}
          startInLoadingState
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <Ionicons name="card-outline" size={22} color={colors.primary[500]} />
        <Text variant="h3">Kart ile Öde</Text>
      </View>

      {loadingCards ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : (
        <View style={styles.list}>
          {cards.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setSelected(c.id)}
              style={[styles.row, selected === c.id && styles.rowActive]}
            >
              <Ionicons
                name={selected === c.id ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected === c.id ? colors.primary[500] : colors.text.muted}
              />
              <Ionicons name="card" size={18} color={colors.text.muted} />
              <Text variant="body" style={styles.cardLabel}>
                {(c.brand || 'Kart') + ' •••• ' + c.last4}
              </Text>
              {selected === c.id && c.requireCvv && (
                <Input
                  containerStyle={styles.cvvInline}
                  placeholder="CVV"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  value={savedCvv}
                  onChangeText={(t) => setSavedCvv(digitsOnly(t))}
                />
              )}
            </Pressable>
          ))}

          <Pressable
            onPress={() => setSelected(NEW_CARD)}
            style={[styles.row, selected === NEW_CARD && styles.rowActive]}
          >
            <Ionicons
              name={selected === NEW_CARD ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={selected === NEW_CARD ? colors.primary[500] : colors.text.muted}
            />
            <Ionicons name="add" size={18} color={colors.text.muted} />
            <Text variant="body" style={styles.cardLabel}>
              Yeni kart ile öde
            </Text>
          </Pressable>

          {selected === NEW_CARD && (
            <View style={styles.newCard}>
              <Input
                placeholder="Kart üzerindeki isim"
                value={holder}
                onChangeText={setHolder}
                autoCapitalize="characters"
              />
              <Input
                placeholder="Kart numarası"
                keyboardType="number-pad"
                maxLength={16}
                value={number}
                onChangeText={(t) => setNumber(digitsOnly(t).slice(0, 16))}
              />
              <View style={styles.expRow}>
                <Input
                  containerStyle={styles.expField}
                  placeholder="AA"
                  keyboardType="number-pad"
                  maxLength={2}
                  value={expMonth}
                  onChangeText={(t) => setExpMonth(digitsOnly(t).slice(0, 2))}
                />
                <Input
                  containerStyle={styles.expField}
                  placeholder="YY"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={expYear}
                  onChangeText={(t) => setExpYear(digitsOnly(t).slice(0, 4))}
                />
                <Input
                  containerStyle={styles.expField}
                  placeholder="CVV"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  value={cvc}
                  onChangeText={(t) => setCvc(digitsOnly(t).slice(0, 4))}
                />
              </View>
              <Checkbox
                checked={saveCard}
                onChange={setSaveCard}
                label="Kartımı sonraki ödemeler ve otomatik yenileme için kaydet"
              />
            </View>
          )}
        </View>
      )}

      <Button
        onPress={submit}
        isLoading={processing}
        disabled={loadingCards}
        fullWidth
        title={
          amount != null
            ? `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL Öde`
            : 'Öde'
        }
        style={styles.payBtn}
      />

      <View style={styles.secure}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.success[600]} />
        <Text variant="caption" tone="muted" style={styles.secureText}>
          Kart bilgileriniz saklanmaz; PayTR ile 256-bit SSL üzerinden işlenir.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  center: { paddingVertical: 32, alignItems: 'center' },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200]!,
  },
  rowActive: { borderColor: colors.primary[500]!, backgroundColor: colors.primary[50]! },
  cardLabel: { flex: 1, fontWeight: '600' },
  cvvInline: { width: 80, marginBottom: 0 },
  newCard: { gap: 10, paddingTop: 4 },
  expRow: { flexDirection: 'row', gap: 10 },
  expField: { flex: 1, marginBottom: 0 },
  payBtn: { marginTop: 8 },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  secureText: { flexShrink: 1 },
  webviewWrap: { flex: 1, minHeight: 480, overflow: 'hidden' },
});
