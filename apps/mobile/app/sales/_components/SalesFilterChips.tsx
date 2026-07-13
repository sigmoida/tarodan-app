import { View, ScrollView } from 'react-native';
import { Chip } from '@tarodan/ui-native';
import { styles } from '../_lib/styles';
import { SALE_FILTERS, getStatusLabel } from '../_lib/status';
import type { FilterType } from '../_lib/types';

/** Yatay durum-filtre çipleri (bounded liste → ScrollView kabul edilir). */
export function SalesFilterChips({
  filter,
  onSelect,
}: {
  filter: FilterType;
  onSelect: (f: FilterType) => void;
}) {
  return (
    <View style={styles.filterContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {SALE_FILTERS.map((f) => (
          <Chip
            key={f}
            label={getStatusLabel(f)}
            selected={filter === f}
            variant="primary"
            onPress={() => onSelect(f)}
            style={styles.filterChip}
          />
        ))}
      </ScrollView>
    </View>
  );
}
