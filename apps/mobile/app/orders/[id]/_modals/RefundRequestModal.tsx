import React from 'react';
import { View, ScrollView, Image, Pressable, StyleSheet } from 'react-native';
import { Modal, Button, Input, RadioGroup, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { REFUND_REASONS, MAX_EVIDENCE_PHOTOS } from '../_lib/status';
import type { RNFile } from '@/lib/api';

const { colors, radius } = theme;

/** İade talebi modalı — kendi form durumunu prop olarak alır (controller: useOrderActions). */
export function RefundRequestModal({
  visible,
  onClose,
  orderQuantity,
  reason,
  setReason,
  description,
  setDescription,
  quantity,
  setQuantity,
  evidence,
  pickEvidence,
  removeEvidence,
  onSubmit,
  isPending,
}: {
  visible: boolean;
  onClose: () => void;
  orderQuantity: number;
  reason: string;
  setReason: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  quantity: number;
  setQuantity: (fn: (q: number) => number) => void;
  evidence: RNFile[];
  pickEvidence: () => void;
  removeEvidence: (i: number) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Modal isOpen={visible} onClose={onClose} title="İade Talebi Oluştur">
      <ScrollView>
        <Text variant="caption" style={styles.refundModalHint}>
          Teslimattan sonra 14 gün içinde sebep belirtmeden iade hakkınız vardır. Sebep, açıklama ve fotoğraf isteğe bağlıdır.
        </Text>

        {orderQuantity > 1 && (
          <View style={styles.qtySection}>
            <Text variant="caption" style={styles.refundModalLabel}>İade Edilecek Adet</Text>
            <Text variant="caption" style={styles.evidenceHint}>
              Bu siparişte {orderQuantity} adet var. Kaç adet iade edeceğinizi seçin.
            </Text>
            <View style={styles.qtyRow}>
              <Pressable
                testID="refund-qty-dec"
                accessibilityRole="button"
                accessibilityLabel="Adet azalt"
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                style={[styles.qtyBtn, quantity <= 1 && styles.qtyBtnDisabled]}
                hitSlop={6}
              >
                <Ionicons name="remove" size={20} color={colors.text.heading} />
              </Pressable>
              <Text testID="refund-qty-value" variant="h3" style={styles.qtyValue}>{quantity}</Text>
              <Pressable
                testID="refund-qty-inc"
                accessibilityRole="button"
                accessibilityLabel="Adet artır"
                onPress={() => setQuantity((q) => Math.min(orderQuantity, q + 1))}
                disabled={quantity >= orderQuantity}
                style={[styles.qtyBtn, quantity >= orderQuantity && styles.qtyBtnDisabled]}
                hitSlop={6}
              >
                <Ionicons name="add" size={20} color={colors.text.heading} />
              </Pressable>
            </View>
          </View>
        )}

        <Text variant="caption" style={styles.refundModalLabel}>İade Nedeni (isteğe bağlı)</Text>
        <RadioGroup value={reason} onChange={setReason} options={REFUND_REASONS} />

        <Input
          label="Açıklama (isteğe bağlı)"
          placeholder="Sorunu kısaca anlatın..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          containerStyle={{ marginTop: 12 }}
          inputStyle={{ minHeight: 80 }}
        />

        <View style={styles.evidenceSection}>
          <Text variant="caption" style={styles.refundModalLabel}>Kanıt Fotoğrafı (isteğe bağlı)</Text>
          <Text variant="caption" style={styles.evidenceHint}>
            Dilerseniz fotoğraf ekleyin (en fazla {MAX_EVIDENCE_PHOTOS}).
          </Text>
          <View style={styles.evidenceGrid}>
            {evidence.map((a, i) => (
              <View key={`${a.uri}-${i}`} style={styles.evidenceThumbWrap}>
                <Image source={{ uri: a.uri }} style={styles.evidenceThumb} />
                <Pressable
                  style={styles.evidenceRemove}
                  onPress={() => removeEvidence(i)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Fotoğrafı kaldır"
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              </View>
            ))}
            {evidence.length < MAX_EVIDENCE_PHOTOS ? (
              <Pressable style={styles.evidenceAdd} onPress={pickEvidence} accessibilityRole="button" accessibilityLabel="Fotoğraf ekle">
                <Ionicons name="camera-outline" size={22} color={colors.text.muted} />
                <Text style={styles.evidenceAddText}>Ekle</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.refundModalActions}>
          <Button variant="ghost" title="Vazgeç" onPress={onClose} disabled={isPending} />
          <Button variant="primary" title="Talebi Gönder" onPress={onSubmit} isLoading={isPending} disabled={isPending} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  refundModalHint: { color: colors.text.muted, marginBottom: 12 },
  refundModalLabel: { color: colors.text.heading, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  refundModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  qtySection: { marginTop: 4, marginBottom: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyValue: { minWidth: 32, textAlign: 'center', color: colors.text.heading },
  evidenceSection: { marginTop: 12 },
  evidenceHint: { color: colors.text.muted, marginBottom: 8 },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evidenceThumbWrap: { width: 72, height: 72, borderRadius: radius.md, overflow: 'visible' },
  evidenceThumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.gray[100] },
  evidenceRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger[600]!,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  evidenceAdd: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  evidenceAddText: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
});
