import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Button, theme } from '@tarodan/ui-native';
import { useZodForm, Form, FormInput } from '@tarodan/ui-native/form';
import { sellerCounterSchema } from '../_lib/schema';
import { useDoCounterOffer } from '../_hooks/useDoCounterOffer';
import type { Offer } from '../_lib/types';

const { spacing } = theme;

/** Satıcının karşı teklifi. Kendi form + mutation'ını taşır; ekran sadece açar/kapatır. */
export function CounterOfferModal({
  offer,
  onClose,
}: {
  offer: Offer | null;
  onClose: () => void;
}) {
  const refAmount = Number(offer?.amount) || 0;
  const maxPrice = Number(offer?.product?.price) || 0;

  const schema = useMemo(
    () => sellerCounterSchema(refAmount, maxPrice),
    [refAmount, maxPrice],
  );
  const form = useZodForm(schema, { defaultValues: { amount: '' } });
  const counter = useDoCounterOffer();

  // Modal her açıldığında (offer değişince) formu sıfırla.
  useEffect(() => {
    if (offer) form.reset({ amount: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  const onSubmit = form.handleSubmit(({ amount }) => {
    if (!offer) return;
    // Modalı ÖNCE kapat: mutation'ın appAlert'ı (başarı/hata) bir ui-native Modal
    // açıkken çağrılırsa iOS donar. [[mobile-modal-freeze-and-modalmessage-primitive]]
    onClose();
    counter.mutate({ id: offer.id, amount: Number(amount) });
  });

  return (
    <Modal isOpen={!!offer} onClose={onClose} title="Karşı Teklif">
      <Form form={form}>
        <FormInput
          name="amount"
          label="Yeni teklif tutarını girin"
          placeholder="Tutar (₺)"
          keyboardType="numeric"
          autoFocus
        />
        <View style={styles.actions}>
          <Button variant="secondary" onPress={onClose} title="Vazgeç" />
          <Button
            variant="primary"
            onPress={onSubmit}
            isLoading={counter.isPending}
            title="Gönder"
          />
        </View>
      </Form>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
});
