import { View } from 'react-native';
import { Button, Input, Modal, Text } from '@tarodan/ui-native';
import { styles } from '../_lib/styles';
import type { SaleActionsController } from '../_hooks/useSaleActions';

/** Kargo takip numarası modalı — "Kargoya Ver" akışını tamamlar. */
export function ShipDialog({ actions }: { actions: SaleActionsController }) {
  const { shipDialog, setShipDialog, trackingNumber, setTrackingNumber, handleShip, updateStatusMutation } =
    actions;

  return (
    <Modal
      isOpen={shipDialog.visible}
      onClose={() => setShipDialog({ visible: false, order: null })}
      title="Kargo Bilgisi"
    >
      <Text variant="body" style={{ marginBottom: 16 }}>
        {shipDialog.order?.product.title}
      </Text>
      <Input
        label="Kargo Takip Numarası"
        value={trackingNumber}
        onChangeText={setTrackingNumber}
        placeholder="Örn: 1234567890"
      />
      <View style={styles.dialogActions}>
        <Button
          variant="ghost"
          title="İptal"
          onPress={() => setShipDialog({ visible: false, order: null })}
        />
        <Button
          variant="primary"
          title="Kargoya Verildi"
          onPress={handleShip}
          isLoading={updateStatusMutation.isPending}
        />
      </View>
    </Modal>
  );
}
