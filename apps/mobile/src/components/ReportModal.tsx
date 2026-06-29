import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { userReportsApi } from '../services/api';
import { theme, Text, Button, Modal, Textarea } from '@tarodan/ui-native';

const { colors } = theme;

export type ReportTargetType = 'product' | 'user' | 'collection' | 'message';

export type ReportReason =
  | 'spam'
  | 'inappropriate_content'
  | 'fake_product'
  | 'scam'
  | 'harassment'
  | 'hate_speech'
  | 'counterfeit'
  | 'wrong_category'
  | 'misleading_info'
  | 'other';

interface ReportModalProps {
  visible: boolean;
  onDismiss: () => void;
  type: ReportTargetType;
  targetId: string;
  targetName: string;
  onSuccess?: () => void;
}

const PRODUCT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'counterfeit', label: 'Sahte / Replika Ürün' },
  { value: 'fake_product', label: 'Var Olmayan / Yanıltıcı İlan' },
  { value: 'misleading_info', label: 'Yanıltıcı Bilgi' },
  { value: 'wrong_category', label: 'Yanlış Kategori' },
  { value: 'inappropriate_content', label: 'Uygunsuz İçerik' },
  { value: 'spam', label: 'Spam / Reklam' },
  { value: 'other', label: 'Diğer' },
];

const USER_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'scam', label: 'Dolandırıcılık' },
  { value: 'harassment', label: 'Taciz / Rahatsız Edici' },
  { value: 'hate_speech', label: 'Nefret Söylemi' },
  { value: 'spam', label: 'Spam Mesajlar' },
  { value: 'inappropriate_content', label: 'Uygunsuz Davranış' },
  { value: 'other', label: 'Diğer' },
];

const GENERIC_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'inappropriate_content', label: 'Uygunsuz İçerik' },
  { value: 'spam', label: 'Spam' },
  { value: 'misleading_info', label: 'Yanıltıcı Bilgi' },
  { value: 'other', label: 'Diğer' },
];

export default function ReportModal({
  visible,
  onDismiss,
  type,
  targetId,
  targetName,
  onSuccess,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');

  const reasons = useMemo(() => {
    if (type === 'product') return PRODUCT_REASONS;
    if (type === 'user') return USER_REASONS;
    return GENERIC_REASONS;
  }, [type]);

  const title = useMemo(() => {
    switch (type) {
      case 'product': return 'İlanı Raporla';
      case 'user': return 'Kullanıcıyı Raporla';
      case 'collection': return 'Koleksiyonu Raporla';
      case 'message': return 'Mesajı Raporla';
      default: return 'Raporla';
    }
  }, [type]);

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!reason) throw new Error('missing_reason');
      return userReportsApi.create({
        type,
        targetId,
        reason: reason as ReportReason,
        description: description || undefined,
      });
    },
  });

  const handleClose = () => {
    setReason('');
    setDescription('');
    reportMutation.reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    if (!reason) return;
    try {
      await reportMutation.mutateAsync();
      onSuccess?.();
      // Kullanıcıya başarı mesajını göster, ardından kapat
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (e) {
      // error state is tracked by mutation
    }
  };

  return (
    <Modal isOpen={visible} onClose={handleClose} title={title}>
      <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
        <Text style={styles.targetInfo} numberOfLines={2}>{targetName}</Text>

        <Text style={styles.sectionTitle}>Raporlama Nedeni</Text>

        {reasons.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[
              styles.reasonItem,
              reason === r.value && styles.reasonItemSelected,
            ]}
            onPress={() => setReason(r.value)}
          >
            <Ionicons
              name={reason === r.value ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={reason === r.value ? colors.primary[600]! : colors.text.muted}
            />
            <Text style={styles.reasonText}>{r.label}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>Açıklama (İsteğe Bağlı)</Text>
        <Textarea
          value={description}
          onChangeText={setDescription}
          rows={3}
          placeholder="Lütfen durumu detaylı açıklayın..."
          maxLength={500}
          style={styles.input}
        />
        <Text style={styles.charCount}>{description.length}/500</Text>

        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color={colors.warning[600]!} />
          <Text style={styles.warningText}>
            Asılsız raporlamalar hesabınızın askıya alınmasına neden olabilir.
          </Text>
        </View>

        {reportMutation.error ? (
          <Text style={styles.errorText}>
            Raporlama gönderilemedi. Lütfen tekrar deneyin.
          </Text>
        ) : null}

        {reportMutation.isSuccess ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
            <Text style={styles.successText}>
              Raporunuz alındı. En kısa sürede incelenecek.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <Button
          variant="ghost"
          title="İptal"
          onPress={handleClose}
          disabled={reportMutation.isPending}
        />
        <Button
          variant="danger"
          title="Raporla"
          onPress={handleSubmit}
          isLoading={reportMutation.isPending}
          disabled={!reason || reportMutation.isPending}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: 480,
  },
  targetInfo: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
    color: colors.text.heading,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.DEFAULT,
  },
  reasonItemSelected: {
    backgroundColor: colors.primary[50]!,
  },
  reasonText: {
    marginLeft: 12,
    color: colors.text.heading,
  },
  input: {
    backgroundColor: colors.surface.DEFAULT,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 4,
    fontSize: 12,
    color: colors.text.muted,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  warningText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 12,
  },
  errorText: {
    textAlign: 'center',
    color: colors.danger[600]!,
    marginTop: 16,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success[50]!,
    padding: 12,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  successText: {
    flex: 1,
    color: colors.success[600]!,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
