import { View, TouchableOpacity } from 'react-native';
import { Card, Button, IconButton, Divider, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import { formatDate, getFilterSummary } from '../_lib/helpers';
import type { SavedSearch } from '../_lib/types';
import type { SavedSearchesController } from '../_hooks/useSavedSearches';

const { colors } = theme;

/** Tek kayıtlı arama kartı — sorgu/filtre özeti, çalıştır/sil, bildirim toggle. */
export function SavedSearchCard({ search, f }: { search: SavedSearch; f: SavedSearchesController }) {
  return (
    <Card style={styles.searchCard}>
      <View style={styles.cardHeader}>
        <View style={styles.titleSection}>
          <Ionicons name="search" size={20} color={colors.primary[600]!} />
          <Text variant="body" style={styles.searchName}>{search.name}</Text>
        </View>
        <IconButton
          icon="trash-outline"
          variant="danger"
          size="sm"
          accessibilityLabel="Aramayı sil"
          onPress={() => f.handleDelete(search)}
        />
      </View>

      {search.query && <Text variant="body" style={styles.queryText}>"{search.query}"</Text>}

      <Text variant="bodySm" style={styles.filtersText}>{getFilterSummary(search.filters)}</Text>

      <Divider style={styles.divider} />

      <View style={styles.cardFooter}>
        <View style={styles.metaInfo}>
          {search.resultCount !== undefined && (
            <Text variant="bodySm" style={styles.metaText}>{search.resultCount} sonuç</Text>
          )}
          <Text variant="bodySm" style={styles.metaText}>Oluşturulma: {formatDate(search.createdAt)}</Text>
        </View>
        <Button variant="primary" size="sm" title="Çalıştır" onPress={() => f.runSearch(search)} />
      </View>

      {/* Notification Toggle */}
      <TouchableOpacity
        style={styles.notifyToggle}
        onPress={() =>
          f.toggleNotificationMutation.mutate({
            searchId: search.id,
            notifyEnabled: !search.notifyEnabled,
          })
        }
      >
        <Ionicons
          name={search.notifyEnabled ? 'notifications' : 'notifications-off-outline'}
          size={18}
          color={search.notifyEnabled ? colors.primary[600]! : colors.text.muted}
        />
        <Text style={[styles.notifyText, search.notifyEnabled && styles.notifyTextActive]}>
          Yeni ürünlerde bildir
        </Text>
      </TouchableOpacity>
    </Card>
  );
}
