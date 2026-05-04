import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Chip, ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Text, ScreenHeader, Searchbar, EmptyState } from '../../src/components/common';
import { TarodanColors } from '../../src/theme';
import { carModelsApi } from '../../src/services/api';
import { transformImageUrl } from '../../src/utils/imageUrl';

/**
 * Araba modeli tarama (web `apps/web/src/app/models/page.tsx` paritesi).
 * - GET /car-models → tüm modelleri çeker
 * - Marka filtresi + arama
 * - Markaya göre gruplanır
 */

interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  country?: string | null;
}

interface CarModel {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  description?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  brand: Brand;
  productCount?: number;
}

export default function ModelsScreen() {
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['car-models'],
    queryFn: async () => {
      const response = await carModelsApi.findAll();
      const items: CarModel[] = (response.data as any) ?? [];
      return Array.isArray(items) ? items : [];
    },
  });

  const models = data ?? [];

  const brands = useMemo(() => {
    const map = new Map<string, Brand>();
    models.forEach((m) => {
      if (m.brand && !map.has(m.brand.slug)) map.set(m.brand.slug, m.brand);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      const matchBrand = selectedBrand === 'all' || m.brand?.slug === selectedBrand;
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.brand?.name?.toLowerCase().includes(q);
      return matchBrand && matchSearch;
    });
  }, [models, search, selectedBrand]);

  const grouped = useMemo(() => {
    const map = new Map<string, { brand: Brand; models: CarModel[] }>();
    filtered.forEach((m) => {
      if (!m.brand) return;
      const slug = m.brand.slug;
      if (!map.has(slug)) {
        map.set(slug, { brand: m.brand, models: [] });
      }
      map.get(slug)!.models.push(m);
    });
    return Array.from(map.values()).sort((a, b) => a.brand.name.localeCompare(b.brand.name));
  }, [filtered]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Araba Modelleri" />

      <View style={styles.searchWrap}>
        <Searchbar
          placeholder="Model veya marka ara..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
          iconColor={TarodanColors.textSecondary}
          inputStyle={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.brandFilterScroll}
        contentContainerStyle={styles.brandFilterRow}
      >
        <Chip
          selected={selectedBrand === 'all'}
          onPress={() => setSelectedBrand('all')}
          style={[styles.brandChip, selectedBrand === 'all' && styles.brandChipActive]}
          textStyle={selectedBrand === 'all' ? styles.brandChipTextActive : undefined}
        >
          Tüm Markalar
        </Chip>
        {brands.map((b) => (
          <Chip
            key={b.slug}
            selected={selectedBrand === b.slug}
            onPress={() => setSelectedBrand(b.slug)}
            style={[styles.brandChip, selectedBrand === b.slug && styles.brandChipActive]}
            textStyle={selectedBrand === b.slug ? styles.brandChipTextActive : undefined}
          >
            {b.name}
          </Chip>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon="car-outline"
          title="Model bulunamadı"
          subtitle={search ? 'Farklı bir arama deneyin.' : 'Henüz araba modeli eklenmemiş.'}
        />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map(({ brand, models: brandModels }) => (
            <View key={brand.slug} style={styles.brandSection}>
              <View style={styles.brandHeader}>
                {brand.logo ? (
                  <Image source={{ uri: transformImageUrl(brand.logo) }} style={styles.brandLogo} />
                ) : (
                  <View style={[styles.brandLogo, styles.brandLogoFallback]}>
                    <Ionicons name="car-sport-outline" size={18} color={TarodanColors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.brandName}>{brand.name}</Text>
                  <Text style={styles.brandMeta}>
                    {brandModels.length} model
                    {brand.country ? ` · ${brand.country}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.modelsGrid}>
                {brandModels.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.modelCard}
                    onPress={() => router.push({ pathname: '/models/[slug]', params: { slug: m.slug } } as any)}
                  >
                    {m.image ? (
                      <Image source={{ uri: transformImageUrl(m.image) }} style={styles.modelImage} />
                    ) : (
                      <View style={[styles.modelImage, styles.modelImageFallback]}>
                        <Ionicons name="car-outline" size={36} color={TarodanColors.textTertiary} />
                      </View>
                    )}
                    <View style={styles.modelBody}>
                      <Text style={styles.modelName} numberOfLines={1}>
                        {m.name}
                      </Text>
                      {(m.yearStart || m.yearEnd) ? (
                        <Text style={styles.modelYears}>
                          {m.yearStart ?? '?'}{m.yearEnd ? ` - ${m.yearEnd}` : ' - günümüz'}
                        </Text>
                      ) : null}
                      {typeof m.productCount === 'number' ? (
                        <Text style={styles.modelCount}>{m.productCount} ürün</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  searchWrap: {
    backgroundColor: TarodanColors.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
  },
  searchBar: {
    backgroundColor: TarodanColors.surfaceVariant,
    elevation: 0,
  },
  searchInput: {
    fontSize: 14,
  },
  brandFilterScroll: {
    backgroundColor: TarodanColors.background,
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
  },
  brandFilterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  brandChip: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  brandChipActive: {
    backgroundColor: TarodanColors.primaryLight,
  },
  brandChipTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  brandSection: {
    backgroundColor: TarodanColors.background,
    marginTop: 12,
    paddingVertical: 12,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  brandLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  brandLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  brandMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  modelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
  },
  modelCard: {
    width: '48%',
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  modelImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: TarodanColors.borderLight,
  },
  modelImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelBody: {
    padding: 10,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  modelYears: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  modelCount: {
    fontSize: 11,
    color: TarodanColors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
});
