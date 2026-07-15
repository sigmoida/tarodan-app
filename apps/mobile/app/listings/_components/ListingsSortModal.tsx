import { View, TouchableOpacity, Modal } from 'react-native';
import { Text, Radio } from '@tarodan/ui-native';
import { SORT_OPTIONS } from '@/utils/productFilters';
import { styles } from '../_lib/styles';
import type { ListingsController } from '../_hooks/useListings';

/** Sıralama seçim modalı (alttan açılan sheet). */
export function ListingsSortModal({ f }: { f: ListingsController }) {
  const select = (value: string) => {
    f.setFilters({ ...f.filters, sortBy: value });
    f.setSortMenuVisible(false);
  };

  return (
    <Modal
      visible={f.sortMenuVisible}
      transparent
      animationType="slide"
      onRequestClose={() => f.setSortMenuVisible(false)}
    >
      <TouchableOpacity style={styles.sortBackdrop} activeOpacity={1} onPress={() => f.setSortMenuVisible(false)}>
        <View style={styles.sortSheet}>
          <View style={styles.sortHandle} />
          <Text variant="h2" style={styles.sortTitle}>Sırala</Text>
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity key={option.value} style={styles.sortOption} onPress={() => select(option.value)}>
              <Text style={styles.sortOptionText}>{option.label}</Text>
              <Radio checked={f.filters.sortBy === option.value} onChange={() => select(option.value)} />
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
