import { View, TouchableOpacity, FlatList } from 'react-native';
import { Text, Input, Chip, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import type { ListingsController } from '../_hooks/useListings';

const { colors } = theme;

/** Arama kutusu + sırala/filtre butonları + aktif filtre çipleri. */
export function ListingsSearchBar({ f }: { f: ListingsController }) {
  return (
    <>
      <View style={styles.searchSection}>
        <Input
          placeholder="Model, marka ara..."
          value={f.searchQuery}
          onChangeText={f.setSearchQuery}
          onSubmitEditing={f.applySearch}
          leftIconName="search"
          containerStyle={styles.searchBar}
        />
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => f.setSortMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Sırala"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.text.muted} />
            <Text style={styles.sortButtonText}>{f.getSortLabel()}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => f.setFilterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Filtreler"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="options-outline" size={18} color={colors.text.muted} />
            <Text style={styles.filterButtonText}>Filtreler</Text>
            {f.activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{f.activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {f.activeChips.length > 0 && (
        <FlatList
          horizontal
          data={f.activeChips}
          keyExtractor={(c) => c.key}
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => (
            <Chip label={`${item.label} ✕`} variant="primary" onPress={item.onRemove} />
          )}
          ListFooterComponent={
            f.activeChips.length > 1 ? (
              <Chip label="Temizle ✕" variant="neutral" onPress={f.clearFilters} />
            ) : null
          }
        />
      )}
    </>
  );
}
