import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Portal, Dialog, Button, TextInput, RadioButton, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import { TarodanColors } from '../theme';

interface ReportModalProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'listing' | 'user';
  targetId: string;
  targetName: string;
  onSuccess?: () => void;
}

type ReportReason = 
  | 'fake_listing'
  | 'counterfeit_product'
  | 'inappropriate_content'
  | 'spam'
  | 'misleading_info'
  | 'harassment'
  | 'fraud'
  | 'other';

const LISTING_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'fake_listing', label: 'Yanlış/Sahte İlan' },
  { value: 'counterfeit_product', label: 'Sahte/Replika Ürün' },
  { value: 'misleading_info', label: 'Yanıltıcı Bilgi' },
  { value: 'inappropriate_content', label: 'Uygunsuz İçerik' },
  { value: 'spam', label: 'Spam/Reklam' },
  { value: 'other', label: 'Diğer' },
];

const USER_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'fraud', label: 'Dolandırıcılık' },
  { value: 'harassment', label: 'Taciz/Rahatsız Edici' },
  { value: 'fake_listing', label: 'Sahte İlanlar' },
  { value: 'spam', label: 'Spam Mesajlar' },
  { value: 'inappropriate_content', label: 'Uygunsuz Davranış' },
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

  const reasons = type === 'listing' ? LISTING_REASONS : USER_REASONS;

  const reportMutation = useMutation({
    mutationFn: async () => {
      const endpoint = type === 'listing' 
        ? `/products/${targetId}/report` 
        : `/users/${targetId}/report`;
      
      return api.post(endpoint, {
        reason,
        description: description || undefined,
      });
    },
    onSuccess: () => {
      onSuccess?.();
      handleClose();
    },
  });

  const handleClose = () => {
    setReason('');
    setDescription('');
    onDismiss();
  };

  const handleSubmit = () => {
    if (!reason) return;
    reportMutation.mutate();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleClose} style={styles.dialog}>
        <Dialog.Title>
          {type === 'listing' ? 'İlanı Raporla' : 'Kullanıcıyı Raporla'}
        </Dialog.Title>

        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            <Text style={styles.targetInfo}>{targetName}</Text>

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
            />
            <Text style={styles.charCount}>{description.length}/500</Text>

            {/* Warning */}
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color={TarodanColors.warning} />
              <Text style={styles.warningText}>
                Asılsız raporlamalar hesabınızın askıya alınmasına neden olabilir.
              </Text>
            </View>

            {/* Error */}
            {reportMutation.error && (
              <Text style={styles.errorText}>
                Raporlama gönderilemedi. Lütfen tekrar deneyin.
              </Text>
            )}

            {/* Success */}
            {reportMutation.isSuccess && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
                <Text style={styles.successText}>
                  Raporunuz alındı. En kısa sürede incelenecek.
                </Text>
              </View>
            )}
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
    maxHeight: '80%',
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
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  reasonItemSelected: {
    backgroundColor: TarodanColors.primaryLight + '10',
  },
  reasonText: {
    marginLeft: 12,
    color: TarodanColors.textPrimary,
  },
  input: {
    marginHorizontal: 24,
    backgroundColor: '#fff',
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
    backgroundColor: TarodanColors.success + '10',
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
