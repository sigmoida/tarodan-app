import React from 'react';
import { View, ScrollView, TouchableOpacity, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip, Input, Text, theme } from '@tarodan/ui-native';

import { SORT_OPTIONS } from '@/utils/productFilters';
import { styles } from '../_lib/searchStyles';
import { SearchSuggestions } from './SearchSuggestions';
import type { SearchController } from '../_hooks/useSearch';

const { colors } = theme;

/**
 * Collapsible top bars (absolute layer): search input + suggestions dropdown,
 * filter/sort buttons, active filter chips, and the results count. Slides up via
 * translateY when the results list scrolls down.
 */
export function SearchBars({ f }: { f: SearchController }) {
  return (
    <Animated.View
      style={[styles.collapsibleBars, { transform: [{ translateY: f.barsTranslateY }] }]}
      onLayout={f.onBarsLayout}
    >
      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchAnchor}>
          <Input
            testID="search-input"
            placeholder="Model, marka veya anahtar kelime..."
            value={f.searchQuery}
            onChangeText={f.handleSearchChange}
            leftIconName="search"
            containerStyle={styles.searchInputContainer}
            fieldStyle={[
              styles.searchInputField,
              f.suggestionsOpen && styles.searchInputFieldOpen,
            ]}
            rightIcon={
              f.suggestionsOpen ? (
                <Pressable onPress={f.closeSuggestions} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                </Pressable>
              ) : undefined
            }
            onFocus={() => {
              f.setShowRecentSearches(true);
              f.setAutocompleteOpen(true);
            }}
            onBlur={() => {
              setTimeout(() => {
                f.setShowRecentSearches(false);
                f.setAutocompleteOpen(false);
              }, 200);
            }}
          />

          <SearchSuggestions f={f} />
        </View>
      </View>

      {/* Filter & Sort Row */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => f.setFilterModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Filtrele"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="filter-outline" size={20} color={colors.text.heading} />
          <Text style={styles.filterButtonText}>Filtrele</Text>
          {f.activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{f.activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => f.setSortModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Sırala"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="swap-vertical-outline" size={20} color={colors.text.heading} />
          <Text style={styles.filterButtonText}>
            {SORT_OPTIONS.find((s) => s.value === f.filters.sortBy)?.label || 'Sırala'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Filter Chips */}
      {f.activeChips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickFilters}
          contentContainerStyle={styles.quickFiltersContent}
        >
          {f.activeChips.map((c) => (
            <Chip
              key={c.key}
              label={`${c.label} ✕`}
              variant="primary"
              onPress={c.onRemove}
              style={styles.activeChip}
            />
          ))}
          {f.activeChips.length > 1 && (
            <Chip label="Temizle ✕" variant="neutral" onPress={f.clearAllFilters} />
          )}
        </ScrollView>
      )}

      {/* Results Count */}
      <View style={styles.resultsCount}>
        <Text style={styles.resultsCountText}>
          {f.isLoading ? 'Aranıyor...' : `${f.total} sonuç bulundu`}
        </Text>
      </View>
    </Animated.View>
  );
}
