import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Button, Input, Text, theme } from '@tarodan/ui-native';

const { colors } = theme;

export function RejectTradeModal({
  visible,
  onClose,
  reason,
  setReason,
  onSubmit,
  isPending,
}: {
  visible: boolean;
  onClose: () => void;
  reason: string;
  setReason: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Modal isOpen={visible} onClose={() => !isPending && onClose()} title="Takası Reddet">
      <Text variant="caption" tone="muted" style={{ marginBottom: 12 }}>
        Bu takas teklifini reddetmek üzeresiniz. İsterseniz bir sebep ekleyebilirsiniz (opsiyonel).
      </Text>
      <Input
        label="Sebep (opsiyonel)"
        value={reason}
        onChangeText={setReason}
        multiline
        numberOfLines={3}
        placeholder="Örn. Teklif uygun değil"
        containerStyle={{ marginBottom: 12 }}
        inputStyle={{ minHeight: 80 }}
      />
      <View style={styles.modalActions}>
        <Button variant="outline" title="Vazgeç" onPress={onClose} disabled={isPending} />
        <Button
          variant="primary"
          title="Reddet"
          onPress={onSubmit}
          isLoading={isPending}
          style={{ backgroundColor: colors.danger[600]! }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
});
