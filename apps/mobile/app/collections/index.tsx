import { View, FlatList, RefreshControl } from 'react-native';
import { theme, Chip, Spinner, Text, Input, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCollectionsBrowse } from './_hooks/useCollectionsBrowse';
import { styles } from './_lib/browseStyles';
import { CollectionBrowseCard } from './_components/CollectionBrowseCard';
import { CollectionsInfoCard } from './_components/CollectionsInfoCard';

const { colors } = theme;

export default function CollectionsScreen() {
  const f = useCollectionsBrowse();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Koleksiyonlar"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      {/* Search */}
      <View style={styles.searchSection}>
        <Input
          placeholder="Koleksiyon ara..."
          value={f.searchQuery}
          onChangeText={f.setSearchQuery}
          leftIconName="search"
        />
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <Chip label="Tümü" selected={f.activeFilter === 'all'} onPress={() => f.setActiveFilter('all')} variant="primary" />
        <Chip label="Popüler" selected={f.activeFilter === 'popular'} onPress={() => f.setActiveFilter('popular')} variant="primary" />
        <Chip label="Yeni" selected={f.activeFilter === 'recent'} onPress={() => f.setActiveFilter('recent')} variant="primary" />
      </View>

      {/* Virtualized (#74): the grid IS the scroll container. Header = section title,
          footer = info card + spacer. */}
      <FlatList
        data={f.isLoading ? [] : f.filteredCollections}
        renderItem={({ item }) => <CollectionBrowseCard item={item} />}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.collectionRow}
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={f.isRefetching}
            onRefresh={f.refetch}
            colors={[colors.primary[600]!]}
            tintColor={colors.primary[600]!}
          />
        }
        ListHeaderComponent={
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📚 Koleksiyonlar</Text>
          </View>
        }
        ListEmptyComponent={
          f.isLoading ? (
            <Spinner size="lg" />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="albums-outline" size={64} color={colors.gray[500]} />
              <Text style={styles.emptyTitle}>Koleksiyon Bulunamadı</Text>
              <Text style={styles.emptySubtitle}>Farklı arama terimleri deneyin</Text>
            </View>
          )
        }
        ListFooterComponent={
          <>
            {!f.isPremiumMember && <CollectionsInfoCard isAuthenticated={f.isAuthenticated} />}
            <View style={{ height: 40 }} />
          </>
        }
      />
    </View>
  );
}
