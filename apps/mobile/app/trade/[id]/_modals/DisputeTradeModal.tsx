import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Button, Input, Text } from '@tarodan/ui-native';
import type { TFn } from '../_lib/types';

type DisputeReason = 'shipment_lost' | 'shipment_damaged' | 'wrong_item' | 'other';

export function DisputeTradeModal({
  visible,
  onClose,
  reason,
  setReason,
  description,
  setDescription,
  onSubmit,
  isPending,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  reason: DisputeReason;
  setReason: (v: DisputeReason) => void;
  description: string;
  setDescription: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  t: TFn;
}) {
  const reasons: [DisputeReason, string][] = [
    ['shipment_lost', t('trade.dispute.reasonShipmentLost')],
    ['shipment_damaged', t('trade.dispute.reasonShipmentDamaged')],
    ['wrong_item', t('trade.dispute.reasonWrongItem')],
    ['other', t('trade.dispute.reasonOther')],
  ];

  return (
    <Modal isOpen={visible} onClose={() => !isPending && onClose()} title={t('trade.dispute.modalTitle')}>
      <Text variant="caption" style={{ marginBottom: 12 }}>{t('trade.dispute.modalIntro')}</Text>
      <View style={{ marginBottom: 12 }}>
        {reasons.map(([value, label]) => (
          <Button
            key={value}
            variant={reason === value ? 'primary' : 'outline'}
            title={label}
            onPress={() => setReason(value)}
            style={{ marginBottom: 6 }}
          />
        ))}
      </View>
      <Input
        label={t('trade.dispute.descriptionLabel')}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        placeholder={t('trade.dispute.descriptionPlaceholder')}
        containerStyle={{ marginBottom: 12 }}
        inputStyle={{ minHeight: 100 }}
      />
      <View style={styles.modalActions}>
        <Button variant="outline" title={t('trade.dispute.cancelCta')} onPress={onClose} disabled={isPending} />
        <Button variant="primary" title={t('trade.dispute.submitCta')} onPress={onSubmit} isLoading={isPending} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
});
