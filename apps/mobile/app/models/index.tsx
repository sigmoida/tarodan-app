import { View, ScrollView } from 'react-native';
import { Chip, Spinner, Input, EmptyState } from '@tarodan/ui-native';
import { ScreenHeader, ThemedRefreshControl } from '@/components/common';
import { useModels } from './_hooks/useModels';
import { styles } from './_lib/styles';
import { ModelsBrandSection } from './_components/ModelsBrandSection';

export default function ModelsScreen() {
  const f = useModels();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Araba Modelleri" />

      <View style={styles.searchWrap}>
        <Input
          placeholder="Model veya marka ara..."
          value={f.search}
          onChangeText={f.setSearch}
          leftIconName="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.brandFilterScroll}
        contentContainerStyle={styles.brandFilterRow}
      >
        <Chip label="Tüm Markalar" selected={f.selectedBrand === 'all'} onPress={() => f.setSelectedBrand('all')} variant="primary" />
        {f.brands.map((b) => (
          <Chip
            key={b.slug}
            label={b.name}
            selected={f.selectedBrand === b.slug}
            onPress={() => f.setSelectedBrand(b.slug)}
            variant="primary"
          />
        ))}
      </ScrollView>

      {f.isLoading ? (
        <View style={styles.loading}>
          <Spinner size="lg" />
        </View>
      ) : f.grouped.length === 0 ? (
        <EmptyState
          icon="car-outline"
          title="Model bulunamadı"
          subtitle={f.search ? 'Farklı bir arama deneyin.' : 'Henüz araba modeli eklenmemiş.'}
        />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
        >
          {f.grouped.map(({ brand, models }) => (
            <ModelsBrandSection key={brand.slug} brand={brand} models={models} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
