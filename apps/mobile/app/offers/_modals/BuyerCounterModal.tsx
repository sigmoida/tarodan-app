import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Modal, Button, theme } from '@tarodan/ui-native';
import { useZodForm, Form, FormInput } from '@tarodan/ui-native/form';
import { buyerCounterSchema } from '../_lib/schema';
import { formatPrice } from '../_lib/status';
import { useDoBuyerCounter } from '../_hooks/useDoBuyerCounter';
import type { Offer } from '../_lib/types';

const { spacing, colors, typography } = theme;

/**
 * Alıcının, satıcının karşı teklifinden DAHA DÜŞÜK teklifi. Kendi form +
 * mutation'ını taşır; ekran sadece açar/kapatır.
 */
export function BuyerCounterModal({
  offer,
  onClose,
}: {
  offer: Offer | null;
  onClose: () => void;
}) {
  const refAmount = Number(offer?.amount) || 0;

  const schema = useMemo(() => buyerCounterSchema(refAmount), [refAmount]);
  const form = useZodForm(schema, { defaultValues: { amount: '' } });
  const buyerCounter = useDoBuyerCounter();

  useEffect(() => {
    if (offer) form.reset({ amount: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  const onSubmit = form.handleSubmit(({ amount }) => {
    if (!offer) return;
    // Modalı ÖNCE kapat: appAlert bir ui-native Modal açıkken çağrılırsa iOS donar.
    // [[mobile-modal-freeze-and-modalmessage-primitive]]
    onClose();
    buyerCounter.mutate({ id: offer.id, amount: Number(amount) });
  });

  return (
    <Modal isOpen={!!offer} onClose={onClose} title="Daha düşük teklif">
      <Form form={form}>
        <Text style={styles.subtitle}>
          Satıcının karşı teklifi: {offer ? formatPrice(refAmount) : '—'}. Bu tutarın
          altında, ilan fiyatının en az %50 kadarına uygun bir teklif yazın.
        </Text>
        <FormInput
          name="amount"
          placeholder="Yeni tutar (₺)"
          keyboardType="numeric"
          autoFocus
        />
        <View style={styles.actions}>
          <Button variant="secondary" onPress={onClose} title="Vazgeç" />
          <Button
            variant="primary"
            onPress={onSubmit}
            isLoading={buyerCounter.isPending}
            title="Gönder"
          />
        </View>
      </Form>
    </Modal>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    marginBottom: spacing[3],
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
});
