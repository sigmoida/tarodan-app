import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/searchStyles';
import type { SearchController } from '../_hooks/useSearch';

const { colors } = theme;

/**
 * Dropdown shown under the search input: recent searches when the box is empty,
 * or the rich autocomplete (suggestions/products/sellers/brands/manufacturers/
 * categories) once ≥2 chars are typed.
 */
export function SearchSuggestions({ f }: { f: SearchController }) {
  return (
    <>
      {/* Recent Searches */}
      {f.showRecentSearches && f.recentSearchQueries.length > 0 && !f.searchQuery && (
        <View style={styles.recentSearchesDropdown}>
          <View style={styles.recentSearchesHeader}>
            <Text style={styles.recentSearchesTitle}>Son Aramalar</Text>
            <TouchableOpacity onPress={f.clearSearches}>
              <Text style={styles.clearRecentText}>Temizle</Text>
            </TouchableOpacity>
          </View>
          {f.recentSearchQueries.map((query, index) => (
            <TouchableOpacity
              key={index}
              style={styles.recentSearchItem}
              onPress={() => f.handleRecentSearchSelect(query)}
            >
              <Ionicons name="time-outline" size={18} color={colors.text.muted} />
              <Text style={styles.recentSearchText}>{query}</Text>
              <TouchableOpacity
                onPress={() => f.removeSearch(query)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color={colors.text.subtle} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Autocomplete Rich */}
      {f.autocompleteOpen && f.autocompleteQuery.length >= 2 && f.autocomplete && (
        <View style={styles.recentSearchesDropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
            {f.autocomplete.suggestions && f.autocomplete.suggestions.length > 0 ? (
              <View style={styles.acSection}>
                <Text style={styles.acSectionTitle}>Öneriler</Text>
                {f.autocomplete.suggestions.slice(0, 5).map((s, i) => (
                  <TouchableOpacity
                    key={`s-${i}`}
                    style={styles.acItem}
                    onPress={() => {
                      f.setSearchQuery(s);
                      f.setAutocompleteOpen(false);
                    }}
                  >
                    <Ionicons name="search" size={16} color={colors.text.subtle} />
                    <Text style={styles.acItemText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {f.autocomplete.products && f.autocomplete.products.length > 0 ? (
              <View style={styles.acSection}>
                <Text style={styles.acSectionTitle}>Ürünler</Text>
                {f.autocomplete.products.slice(0, 5).map((p) => (
                  <TouchableOpacity
                    key={`p-${p.id}`}
                    style={styles.acItem}
                    onPress={() => {
                      f.setAutocompleteOpen(false);
                      router.push({ pathname: '/product/[id]', params: { id: p.id } } as any);
                    }}
                  >
                    <Ionicons name="cube-outline" size={16} color={colors.primary[600]!} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.acItemText} numberOfLines={1}>{p.title}</Text>
                      <Text style={styles.acItemMeta}>
                        {p.brandName ? `${p.brandName} · ` : ''}₺{p.price?.toLocaleString('tr-TR')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {f.sellerResults.length > 0 ? (
              <View style={styles.acSection}>
                <Text style={styles.acSectionTitle}>Satıcılar</Text>
                {f.sellerResults.slice(0, 6).map((s) => (
                  <TouchableOpacity
                    key={`s-${s.id}`}
                    style={styles.acItem}
                    onPress={() => {
                      f.setAutocompleteOpen(false);
                      router.push(`/seller/${s.id}` as any);
                    }}
                  >
                    <Ionicons name="storefront-outline" size={16} color={colors.primary[600]!} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.acItemText} numberOfLines={1}>{s.displayName}</Text>
                      {typeof s.totalListings === 'number' ? (
                        <Text style={styles.acItemMeta}>{s.totalListings} ilan</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {f.autocomplete.brands && f.autocomplete.brands.length > 0 ? (
              <View style={styles.acSection}>
                <Text style={styles.acSectionTitle}>Markalar</Text>
                {f.autocomplete.brands.slice(0, 5).map((b) => (
                  <TouchableOpacity
                    key={`b-${b.id}`}
                    style={styles.acItem}
                    onPress={() =>
                      f.applyFacet({ brandId: b.id, brand: b.name, carModel: '', carModelId: '' })
                    }
                  >
                    <Ionicons name="bookmark-outline" size={16} color={colors.text.muted} />
                    <Text style={styles.acItemText}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {f.autocomplete.manufacturers && f.autocomplete.manufacturers.length > 0 ? (
              <View style={styles.acSection}>
                <Text style={styles.acSectionTitle}>Üreticiler</Text>
                {f.autocomplete.manufacturers.slice(0, 5).map((m) => (
                  <TouchableOpacity
                    key={`mf-${m.id}`}
                    style={styles.acItem}
                    onPress={() =>
                      f.applyFacet({ manufacturerId: m.id, manufacturer: m.name })
                    }
                  >
                    <Ionicons name="construct-outline" size={16} color={colors.text.muted} />
                    <Text style={styles.acItemText}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {f.autocomplete.categories && f.autocomplete.categories.length > 0 ? (
              <View style={styles.acSection}>
                <Text style={styles.acSectionTitle}>Kategoriler</Text>
                {f.autocomplete.categories.slice(0, 5).map((c) => (
                  <TouchableOpacity
                    key={`c-${c.id}`}
                    style={styles.acItem}
                    onPress={() =>
                      f.applyFacet({ categoryId: c.id, category: c.name })
                    }
                  >
                    <Ionicons name="grid-outline" size={16} color={colors.text.muted} />
                    <Text style={styles.acItemText}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      )}
    </>
  );
}
