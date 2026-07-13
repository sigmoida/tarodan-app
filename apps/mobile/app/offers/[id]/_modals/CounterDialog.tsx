import { View } from 'react-native';
import { Button, Modal, Input, Text, theme } from '@tarodan/ui-native';
import { styles } from '../_lib/styles';
import type { OfferDetailController } from '../_hooks/useOfferDetail';

const { colors } = theme;

/** Karşı teklif tutarı modalı — validasyon controller'ın submitCounter'ında. */
export function CounterDialog({ f }: { f: OfferDetailController }) {
  return (
    <Modal isOpen={f.counterDialog} onClose={() => f.setCounterDialog(false)} title="Karşı Teklif">
      <Text style={{ marginBottom: 12, color: colors.text.muted }}>
        Karşı teklif tutarınızı girin.
      </Text>
      <Input
        label="Tutar (TL)"
        value={f.counterAmount}
        onChangeText={f.setCounterAmount}
        keyboardType="numeric"
      />
      <View style={styles.dialogActions}>
        <Button variant="ghost" onPress={() => f.setCounterDialog(false)}>
          Vazgeç
        </Button>
        <Button
          variant="primary"
          onPress={f.submitCounter}
          isLoading={f.counterMutation.isPending}
          disabled={f.counterMutation.isPending || f.counterValue <= 0}
        >
          Gönder
        </Button>
      </View>
    </Modal>
  );
}
