import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Portal, Dialog, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { userReportsApi } from '../services/api';
import { TarodanColors } from '../theme';
import { Text, TextInput } from './common/PaperCompat';

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
    <Portal>
      <Dialog visible={visible} onDismiss={handleClose} style={styles.dialog}>
        <Dialog.Title>{title}</Dialog.Title>

        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            <Text style={styles.targetInfo} numberOfLines={2}>{targetName}</Text>

            <Text variant="titleSmall" style={styles.sectionTitle}>Raporlama Nedeni</Text>

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
                  color={reason === r.value ? TarodanColors.primary : TarodanColors.textSecondary}
                />
                <Text style={styles.reasonText}>{r.label}</Text>
              </TouchableOpacity>
            ))}

            <Text variant="titleSmall" style={styles.sectionTitle}>Açıklama (İsteğe Bağlı)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              mode="outlined"
              placeholder="Lütfen durumu detaylı açıklayın..."
              maxLength={500}
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <Text style={styles.charCount}>{description.length}/500</Text>

            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color={TarodanColors.warning} />
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
                <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
                <Text style={styles.successText}>
                  Raporunuz alındı. En kısa sürede incelenecek.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </Dialog.ScrollArea>

        <Dialog.Actions>
          <Button onPress={handleClose} disabled={reportMutation.isPending}>
            İptal
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={reportMutation.isPending}
            disabled={!reason || reportMutation.isPending}
            buttonColor={TarodanColors.error}
          >
            Raporla
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '85%',
    backgroundColor: TarodanColors.background,
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  targetInfo: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
    color: TarodanColors.textPrimary,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 24,
    color: TarodanColors.textPrimary,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TarodanColors.border,
  },
  reasonItemSelected: {
    backgroundColor: TarodanColors.primaryLight,
  },
  reasonText: {
    marginLeft: 12,
    color: TarodanColors.textPrimary,
  },
  input: {
    marginHorizontal: 24,
    backgroundColor: TarodanColors.background,
  },
  charCount: {
    textAlign: 'right',
    marginHorizontal: 24,
    marginTop: 4,
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.warningLight,
    padding: 12,
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  warningText: {
    flex: 1,
    color: TarodanColors.warning,
    fontSize: 12,
  },
  errorText: {
    textAlign: 'center',
    color: TarodanColors.error,
    marginHorizontal: 24,
    marginTop: 16,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.successLight,
    padding: 12,
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  successText: {
    flex: 1,
    color: TarodanColors.success,
    fontSize: 12,
  },
});
