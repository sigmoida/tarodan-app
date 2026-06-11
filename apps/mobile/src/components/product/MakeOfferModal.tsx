import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { theme, Text, Button, Modal, Input, Textarea, appAlert } from '@tarodan/ui-native';
import { offersApi } from '../../services/api';
import { formatPrice } from '../../utils/format';

const { colors } = theme;

interface MakeOfferModalProps {
  visible: boolean;
  onDismiss: () => void;
  productId: string;
  productTitle: string;
  /** Liste fiyatı (satıcının istediği fiyat) — kullanıcının altında teklif vermesi beklenir. */
  listPrice: number;
  /** Başarılı gönderim sonrası callback (örn. snackbar). */
  onSuccess?: () => void;
}

/**
 * Ürün detayında "Teklif Ver" butonuna tıklayınca açılan modal.
 * Web `apps/web/src/app/listings/[id]/page.tsx:424` ile aynı `offersApi.create({ productId, amount, message })`.
 */
export default function MakeOfferModal({
  visible,
  onDismiss,
  productId,
  productTitle,
  listPrice,
  onSuccess,
}: MakeOfferModalProps) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  const createOfferMutation = useMutation({
    mutationFn: () =>
      offersApi.create({
        productId,
        amount: parseFloat(amount),
        message: message.trim() || undefined,
      }),
  });

  const handleClose = () => {
    setAmount('');
    setMessage('');
    createOfferMutation.reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    const numeric = parseFloat(amount);
    if (!numeric || numeric <= 0) {
      appAlert('Geçersiz Tutar', 'Pozitif bir teklif tutarı girin.');
      return;
    }
    // API kuralı: minimum teklif fiyatın %50'si (web paritesi) — yoksa ham 400 dönüyordu.
    const minOffer = listPrice * 0.5;
    if (numeric < minOffer) {
      appAlert('Düşük Tutar', `Minimum teklif ₺${minOffer.toLocaleString('tr-TR')} (fiyatın %50'si).`);
      return;
    }
    if (numeric >= listPrice) {
      appAlert(
        'Yüksek Tutar',
        'Teklifiniz liste fiyatından yüksek veya eşit. Doğrudan satın alma seçeneğini kullanabilirsiniz.',
        [{ text: 'Tamam' }],
      );
      return;
    }
    try {
      await createOfferMutation.mutateAsync();
      onSuccess?.();
      handleClose();
    } catch (e: any) {
      appAlert(
        'Hata',
        e?.response?.data?.message || 'Teklif gönderilemedi. Lütfen tekrar deneyin.',
      );
    }
  };

  const numeric = parseFloat(amount) || 0;
  const discount = listPrice > 0 && numeric > 0 ? listPrice - numeric : 0;
  const discountPct = listPrice > 0 && numeric > 0 ? Math.round(((listPrice - numeric) / listPrice) * 100) : 0;

  return (
    <Modal isOpen={visible} onClose={handleClose} title="Teklif Ver">
      <View>
        <Text style={styles.productTitle} numberOfLines={2}>
          {productTitle}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Liste fiyatı:</Text>
          <Text style={styles.priceValue}>{formatPrice(listPrice)}</Text>
        </View>

        <Input
          testID="offer-amount-input"
          label="Teklif tutarınız (TL) *"
          value={amount}
          onChangeText={(v: string) => setAmount(v.replace(/[^\d.,]/g, '').replace(',', '.'))}
          // Maestro: numeric klavyede return tuşu yok → hideKeyboard çalışmıyor.
          // Test modunda default klavye (return var); input zaten rakam-dışını filtreler.
          keyboardType={process.env.EXPO_PUBLIC_MAESTRO === '1' ? 'default' : 'numeric'}
          containerStyle={styles.input}
          placeholder="Örn. 1500"
        />

        {numeric > 0 && discount > 0 ? (
          <View style={styles.discountInfo}>
            <Ionicons name="trending-down" size={16} color={colors.success[600]!} />
            <Text style={styles.discountText}>
              Liste fiyatından {formatPrice(discount)} ({discountPct}%) daha düşük
            </Text>
          </View>
        ) : null}

        <Textarea
          label="Mesaj (opsiyonel)"
          value={message}
          onChangeText={setMessage}
          rows={3}
          maxLength={500}
          containerStyle={styles.input}
          placeholder="Satıcıya bir mesaj ekleyin..."
        />

        <View style={styles.warning}>
          <Ionicons name="information-circle-outline" size={16} color={colors.info[600]!} />
          <Text style={styles.warningText}>
            Teklifiniz satıcıya iletilir. Satıcı kabul ederse otomatik olarak siparişe dönüştürülür.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          variant="ghost"
          title="Vazgeç"
          onPress={handleClose}
          disabled={createOfferMutation.isPending}
        />
        <Button
          testID="offer-submit-button"
          variant="primary"
          title="Teklif Gönder"
          onPress={handleSubmit}
          isLoading={createOfferMutation.isPending}
          disabled={!numeric || createOfferMutation.isPending}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.DEFAULT,
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.heading,
  },
  input: {
    marginBottom: 10,
  },
  discountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.success[50]!,
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  discountText: {
    flex: 1,
    fontSize: 12,
    color: colors.success[600]!,
    fontWeight: '600',
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.info[50]!,
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: colors.info[600]!,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
