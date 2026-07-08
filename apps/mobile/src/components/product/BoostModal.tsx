/**
 * BoostModal — İlanı öne çıkar (boost): süre/fiyat seç → ödeme başlat → /payment/[id].
 * Web BoostModal ile birebir akış. Backend: GET /products/boost/pricing,
 * POST /products/:id/boost/initiate.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';
import { productsApi } from '../../services/api';

const { colors } = theme;

interface BoostOption {
  durationDays: number;
  price: number;
  label: string;
}

interface BoostModalProps {
  visible: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  /** İlanın mevcut boost bitiş tarihi (varsa) — kalan süre + uzatma bilgisi için */
  boostedUntil?: string | null;
  /** Premium kullanıcı — "otomatik yenileme" premium'a özel */
  isPremium?: boolean;
}

export function BoostModal({
  visible,
  onClose,
  listingId,
  listingTitle,
  boostedUntil,
  isPremium = false,
}: BoostModalProps) {
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [options, setOptions] = useState<BoostOption[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoadingPricing(true);
    productsApi
      .getBoostPricing()
      .then((res) => {
        const data: any = res?.data ?? {};
        const opts: BoostOption[] = Array.isArray(data.options) ? data.options : [];
        setOptions(opts);
        setEnabled(data.enabled !== false);
        const seven = opts.find((o) => o.durationDays === 7);
        setSelected(seven?.durationDays ?? opts[0]?.durationDays ?? null);
      })
      .catch(() => {
        setOptions([]);
        setEnabled(false);
      })
      .finally(() => setLoadingPricing(false));
  }, [visible]);

  const remainingDays = boostedUntil
    ? Math.max(0, Math.ceil((new Date(boostedUntil).getTime() - Date.now()) / 86400000))
    : 0;
  const hasActiveBoost = remainingDays > 0;

  const handleConfirm = async () => {
    if (selected == null || submitting) return;
    setSubmitting(true);
    try {
      const res = await productsApi.initiateBoost(listingId, {
        durationDays: selected,
        autoRenew: isPremium ? autoRenew : false,
        provider: 'paytr',
      });
      const data: any = res?.data?.data ?? res?.data ?? {};
      const paymentId = data.paymentId || data.id || data.payment?.id;
      // initiateBoost zaten PayTR token + URL üretip döndürür. URL'i ödeme ekranına
      // geçiriyoruz ki ekran tekrar initiate/retry ETMESİN (retry pending ödemeyi
      // reddediyor → "Sadece başarısız ödemeler tekrar denenebilir" hatası). Checkout
      // ile aynı pattern: tek kullanımlık token boşa harcanmaz.
      const paymentUrl: string | undefined = data.paymentUrl;
      if (paymentId) {
        setSubmitting(false);
        onClose();
        router.push({
          pathname: '/payment/[id]',
          params: {
            id: String(paymentId),
            provider: 'paytr',
            guest: '0',
            type: 'boost',
            ...(paymentUrl ? { paymentUrl } : {}),
          },
        } as any);
        return;
      }
      throw new Error('payment-id-missing');
    } catch {
      setSubmitting(false);
    }
  };

  const confirmDisabled = submitting || loadingPricing || !enabled || selected == null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="rocket" size={20} color={colors.warning[500]!} />
              <Text style={styles.headerTitle}>İlanı Öne Çıkar</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.gray[500]!} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.subtitle} numberOfLines={3}>
              <Text style={styles.subtitleStrong}>{listingTitle}</Text> ilanını seçtiğiniz süre
              boyunca arama, kategori ve ana sayfa vitrininde üst sıralarda gösterin.
            </Text>

            {hasActiveBoost && (
              <View style={styles.activeNotice}>
                <Text style={styles.activeNoticeText}>
                  Bu ilanda aktif öne çıkarma var: ~{remainingDays} gün kaldı. Seçtiğiniz süre kalan
                  sürenin üstüne eklenir.
                  {selected != null ? ` Toplam ~${remainingDays + selected} gün olacak.` : ''}
                </Text>
              </View>
            )}

            {loadingPricing ? (
              <ActivityIndicator color={colors.primary[600]!} style={{ paddingVertical: 28 }} />
            ) : !enabled ? (
              <Text style={styles.emptyText}>Öne çıkarma şu anda kullanılamıyor.</Text>
            ) : options.length === 0 ? (
              <Text style={styles.emptyText}>Uygun bir öne çıkarma paketi bulunamadı.</Text>
            ) : (
              <View style={styles.optionList}>
                {options.map((opt) => {
                  const active = selected === opt.durationDays;
                  return (
                    <TouchableOpacity
                      key={opt.durationDays}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => setSelected(opt.durationDays)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.optionLeft}>
                        <Ionicons
                          name={active ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={active ? colors.warning[500]! : colors.gray[300]!}
                        />
                        <Text style={styles.optionLabel}>{opt.label}</Text>
                      </View>
                      <Text style={styles.optionPrice}>{opt.price.toLocaleString('tr-TR')} ₺</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {isPremium && enabled && options.length > 0 && (
              <View style={styles.autoRenewRow}>
                <Text style={styles.autoRenewText}>
                  Süre bitince otomatik yenileme hatırlatması al (Premium)
                </Text>
                <Switch
                  value={autoRenew}
                  onValueChange={setAutoRenew}
                  trackColor={{ true: colors.warning[500]!, false: colors.gray[300]! }}
                />
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.btnSecondaryText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, confirmDisabled && styles.btnDisabled]}
              onPress={handleConfirm}
              disabled={confirmDisabled}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {hasActiveBoost ? 'Süreyi Uzat ve Öde' : 'Öne Çıkar ve Öde'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay.black50,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200]!,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.gray[900]! },
  body: { paddingHorizontal: 18, paddingTop: 14 },
  subtitle: { fontSize: 13, color: colors.gray[500]!, marginBottom: 14, lineHeight: 19 },
  subtitleStrong: { fontWeight: '700', color: colors.gray[900]! },
  activeNotice: {
    backgroundColor: colors.warning[50]!,
    borderWidth: 1,
    borderColor: colors.warning[200]!,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  activeNoticeText: { fontSize: 12.5, color: colors.warning[700]!, lineHeight: 18 },
  emptyText: { textAlign: 'center', color: colors.gray[500]!, paddingVertical: 22 },
  optionList: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200]!,
  },
  optionActive: { borderColor: colors.warning[500]!, backgroundColor: colors.warning[50]! },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionLabel: { fontSize: 14, fontWeight: '600', color: colors.gray[900]! },
  optionPrice: { fontSize: 15, fontWeight: '700', color: colors.primary[600]! },
  autoRenewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  autoRenewText: { flex: 1, fontSize: 13, color: colors.gray[700]! },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200]!,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: { backgroundColor: colors.gray[100]! },
  btnSecondaryText: { fontSize: 15, fontWeight: '600', color: colors.gray[700]! },
  btnPrimary: { backgroundColor: colors.warning[500]! },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.white },
  btnDisabled: { opacity: 0.5 },
});
