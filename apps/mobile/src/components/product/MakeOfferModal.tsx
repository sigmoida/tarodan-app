import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Portal, Dialog, Button, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Text, TextInput } from '../common';
import { TarodanColors } from '../../theme';
import { offersApi } from '../../services/api';
import { formatPrice } from '../../utils/format';

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
      Alert.alert('Geçersiz Tutar', 'Pozitif bir teklif tutarı girin.');
      return;
    }
    if (numeric >= listPrice) {
      Alert.alert(
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
      Alert.alert(
        'Hata',
        e?.response?.data?.message || 'Teklif gönderilemedi. Lütfen tekrar deneyin.',
      );
    }
  };

  const numeric = parseFloat(amount) || 0;
  const discount = listPrice > 0 && numeric > 0 ? listPrice - numeric : 0;
  const discountPct = listPrice > 0 && numeric > 0 ? Math.round(((listPrice - numeric) / listPrice) * 100) : 0;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleClose} style={styles.dialog}>
        <Dialog.Title>Teklif Ver</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.productTitle} numberOfLines={2}>
            {productTitle}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Liste fiyatı:</Text>
            <Text style={styles.priceValue}>{formatPrice(listPrice)}</Text>
          </View>

          <TextInput
            testID="offer-amount-input"
            mode="outlined"
            label="Teklif tutarınız (TL) *"
            value={amount}
            onChangeText={(v: string) => setAmount(v.replace(/[^\d.,]/g, '').replace(',', '.'))}
            keyboardType="numeric"
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            style={styles.input}
            placeholder="Örn. 1500"
          />

          {numeric > 0 && discount > 0 ? (
            <View style={styles.discountInfo}>
              <Ionicons name="trending-down" size={16} color={TarodanColors.success} />
              <Text style={styles.discountText}>
                Liste fiyatından {formatPrice(discount)} ({discountPct}%) daha düşük
              </Text>
            </View>
          ) : null}

          <TextInput
            mode="outlined"
            label="Mesaj (opsiyonel)"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={3}
            maxLength={500}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            style={styles.input}
            placeholder="Satıcıya bir mesaj ekleyin..."
          />

          <View style={styles.warning}>
            <Ionicons name="information-circle-outline" size={16} color={TarodanColors.info} />
            <Text style={styles.warningText}>
              Teklifiniz satıcıya iletilir. Satıcı kabul ederse otomatik olarak siparişe dönüştürülür.
            </Text>
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleClose} disabled={createOfferMutation.isPending}>
            Vazgeç
          </Button>
          <Button
            testID="offer-submit-button"
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={handleSubmit}
            loading={createOfferMutation.isPending}
            disabled={!numeric || createOfferMutation.isPending}
          >
            Teklif Gönder
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: TarodanColors.background,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TarodanColors.border,
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  input: {
    marginBottom: 10,
    backgroundColor: TarodanColors.background,
  },
  discountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TarodanColors.successLight,
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  discountText: {
    flex: 1,
    fontSize: 12,
    color: TarodanColors.success,
    fontWeight: '600',
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: TarodanColors.infoLight,
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: TarodanColors.info,
    lineHeight: 16,
  },
});
