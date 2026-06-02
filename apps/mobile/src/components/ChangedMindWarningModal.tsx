import { View, StyleSheet } from 'react-native';
import { Modal, Button, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Faz 4C.3 — changed_mind reason seçildiğinde uyarı modalı.
 */
export interface ChangedMindWarningModalProps {
  visible: boolean;
  onCancel: () => void;
  onContinue: () => void;
}

const { colors, spacing } = theme;

export function ChangedMindWarningModal({
  visible,
  onCancel,
  onContinue,
}: ChangedMindWarningModalProps) {
  return (
    <Modal visible={visible} onDismiss={onCancel} title="Dikkat — Keyfi vazgeçme">
      <View style={styles.iconRow}>
        <Ionicons name="warning-outline" size={48} color={colors.warning[600]} />
      </View>

      <Text variant="body" style={{ marginTop: spacing.md, textAlign: 'center' }}>
        Bu sebepte <Text style={{ fontWeight: '600' }}>sadece ürün bedeli</Text>{' '}
        iade edilir.
      </Text>

      <Text variant="body" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
        <Text style={{ fontWeight: '600' }}>
          Kargo bedeli ve %3 platform hizmet bedeli iade edilmez.
        </Text>
      </Text>

      <Text variant="body" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
        Ayrıca <Text style={{ fontWeight: '600' }}>satıcı onayı zorunludur</Text>.
        Talep oluşturulduktan sonra satıcı kabul ederse iade kargosu açılır;
        reddederse admin'e itiraz hakkın olur.
      </Text>

      <View style={styles.buttonRow}>
        <Button
          variant="outline"
          title="Vazgeç"
          onPress={onCancel}
          style={{ flex: 1 }}
        />
        <Button
          variant="primary"
          title="Devam Et"
          onPress={onContinue}
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconRow: {
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
