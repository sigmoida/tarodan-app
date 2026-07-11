import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';

const { colors } = theme;

export interface PickerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  data: any[];
  onSelect: (item: any) => void;
  selectedId: string;
  searchValue?: string;
  onSearchChange?: (t: string) => void;
  keyExtractor: (item: any) => string;
  labelExtractor: (item: any) => string;
  emptyText?: string;
  loading?: boolean;
  modalKey?: string;
}

/**
 * Bottom-sheet picker used for category/brand/model/material/manufacturer/year
 * and manufacturer-scoped attribute selections. Lifted verbatim from the
 * monolith's `renderPickerModal` helper.
 */
export function PickerModal({
  visible,
  onClose,
  title,
  data,
  onSelect,
  selectedId,
  searchValue,
  onSearchChange,
  keyExtractor,
  labelExtractor,
  emptyText,
  loading,
  modalKey,
}: PickerModalProps) {
  const filtered =
    searchValue !== undefined
      ? data.filter((item) =>
          labelExtractor(item).toLowerCase().includes((searchValue || '').toLowerCase())
        )
      : data;

  return (
    <Modal key={modalKey} visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {onSearchChange !== undefined && (
            <TextInput
              style={styles.modalSearch}
              placeholder="Ara..."
              placeholderTextColor={colors.text.subtle}
              value={searchValue}
              onChangeText={onSearchChange}
              autoCorrect={false}
            />
          )}

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary[600]!} style={{ marginTop: 32 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => keyExtractor(item)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>{emptyText || 'Sonuç bulunamadı'}</Text>
              }
              renderItem={({ item }) => {
                const isSelected = keyExtractor(item) === selectedId;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <Text style={[styles.modalItemText, isSelected && styles.modalItemTextSelected]}>
                      {labelExtractor(item)}
                    </Text>
                    {isSelected && <Text style={styles.checkMark}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
