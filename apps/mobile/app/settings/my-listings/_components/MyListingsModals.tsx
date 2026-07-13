import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Button, Divider, Text, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import type { MyListingsController } from '../_hooks/useMyListings';

const { colors } = theme;

/** Per-listing action menu + delete confirmation dialog. */
export function MyListingsModals({ f }: { f: MyListingsController }) {
  const menu = f.actionMenuListing;
  return (
    <>
      {/* Action Menu Modal */}
      <Modal
        isOpen={f.actionMenuListing !== null}
        onClose={() => f.setActionMenuListing(null)}
        title="İşlemler"
      >
        {menu && (
          <View>
            {menu.status !== 'deleted' && (
              <Pressable style={styles.menuItem} onPress={() => f.handleMenuAction('view', menu)}>
                <Ionicons name="eye" size={20} color={colors.text.heading} />
                <Text style={styles.menuItemText}>Görüntüle</Text>
              </Pressable>
            )}
            {menu.status !== 'sold' && menu.status !== 'deleted' && (
              <Pressable style={styles.menuItem} onPress={() => f.handleMenuAction('edit', menu)}>
                <Ionicons name="pencil" size={20} color={colors.text.heading} />
                <Text style={styles.menuItemText}>Düzenle</Text>
              </Pressable>
            )}
            {menu.status === 'active' && (
              <Pressable style={styles.menuItem} onPress={() => f.handleMenuAction('boost', menu)}>
                <Ionicons name="rocket" size={20} color={colors.warning[600]!} />
                <Text style={[styles.menuItemText, { color: colors.warning[700]! }]}>Öne Çıkar</Text>
              </Pressable>
            )}
            {menu.status === 'active' && (
              <Pressable style={styles.menuItem} onPress={() => f.handleMenuAction('deactivate', menu)}>
                <Ionicons name="pause-circle" size={20} color={colors.text.heading} />
                <Text style={styles.menuItemText}>Deaktif Et</Text>
              </Pressable>
            )}
            {menu.status === 'inactive' && (
              <Pressable style={styles.menuItem} onPress={() => f.handleMenuAction('relist', menu)}>
                <Ionicons name="refresh" size={20} color={colors.text.heading} />
                <Text style={styles.menuItemText}>Yeniden Yayınla</Text>
              </Pressable>
            )}
            <Divider />
            <Pressable style={styles.menuItem} onPress={() => f.handleMenuAction('delete', menu)}>
              <Ionicons name="trash" size={20} color={colors.danger[600]!} />
              <Text style={[styles.menuItemText, { color: colors.danger[600]! }]}>Sil</Text>
            </Pressable>
          </View>
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal
        isOpen={f.deleteDialogVisible}
        onClose={() => f.setDeleteDialogVisible(false)}
        title="İlanı Sil"
      >
        <Text style={{ marginBottom: theme.spacing[4], color: colors.text.body }}>
          "{f.selectedListing?.title}" ilanını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
        </Text>
        <View style={styles.dialogActions}>
          <Button variant="ghost" title="İptal" onPress={() => f.setDeleteDialogVisible(false)} />
          <Button
            variant="danger"
            title="Sil"
            isLoading={f.deleteMutation.isPending}
            onPress={() => f.selectedListing && f.deleteMutation.mutate(f.selectedListing.id)}
          />
        </View>
      </Modal>
    </>
  );
}
