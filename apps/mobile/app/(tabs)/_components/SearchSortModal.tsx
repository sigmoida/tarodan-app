import React from 'react';
import { View, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radio, Text, theme } from '@tarodan/ui-native';

import { SORT_OPTIONS } from '../../../src/utils/productFilters';
import { styles } from '../_lib/searchStyles';
import type { SearchController } from '../_hooks/useSearch';

const { colors } = theme;

/** Bottom-sheet sort picker (web SidebarFilters sort parity). */
export function SearchSortModal({ f }: { f: SearchController }) {
  return (
    <Modal
      visible={f.sortModalVisible}
      animationType="slide"
      transparent
      onRequestClose={() => f.setSortModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.sortModalBackdrop}
        activeOpacity={1}
        onPress={() => f.setSortModalVisible(false)}
      >
        <View style={styles.sortModalContent}>
          <View style={styles.sortModalHandle} />
          <Text variant="h2" style={styles.sortModalTitle}>
            Sıralama
          </Text>
          {SORT_OPTIONS.map((option) => {
            const isActive = f.filters.sortBy === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={styles.sortOption}
                onPress={() => {
                  f.setFilters({ ...f.filters, sortBy: option.value });
                  f.setSortModalVisible(false);
                }}
              >
                <Ionicons
                  name={option.icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={20}
                  color={isActive ? colors.primary[600]! : colors.text.muted}
                />
                <Text
                  variant="body"
                  tone={isActive ? 'primary' : 'heading'}
                  weight={isActive ? 'semibold' : 'regular'}
                  style={styles.sortOptionText}
                >
                  {option.label}
                </Text>
                <Radio checked={isActive} onChange={() => {
                  f.setFilters({ ...f.filters, sortBy: option.value });
                  f.setSortModalVisible(false);
                }} />
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
