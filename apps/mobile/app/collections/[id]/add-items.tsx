import { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { theme, Button, Input, Snackbar, Spinner, Text } from '@tarodan/ui-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi, collectionsApi } from '../../../src/services/api';
import { resolveImageUrl } from '../../../src/utils/imageUrl';

const { colors } = theme;

// Optimistic ekleme sırasında gerçek itemId gelene kadar kullanılan geçici işaret.
// invalidate sonrası sunucudan gelen gerçek id ile değişir.
const OPTIMISTIC = '__optimistic__';

interface Listing {
  id: string;
  title: string;
  price: number;
  status: string;
  images: Array<{ url: string }>;
}

export default function AddCollectionItemsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collectionId = String(id);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  // o an POST/DELETE bekleyen productId'ler (satır spinner'ı + tekrar-tıklama kilidi)
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Kullanıcının kendi ilanları. Sadece koleksiyonda görünür olabilecek
  // durumdakileri (active/sold) göster — backend görünür item filtresiyle birebir,
  // aksi halde eklenen ürün koleksiyonda görünmez ve kullanıcı şaşırır.
  const { data: listings = [], isLoading: listingsLoading } = useQuery<Listing[]>({
    queryKey: ['my-listings', 'all'],
    queryFn: async () => {
      const res = await productsApi.getMyListings({ limit: 100 });
      const all: Listing[] = res.data?.data || res.data || [];
      return all.filter((l) => l.status === 'active' || l.status === 'sold');
    },
  });

  // Koleksiyondaki ürünler → productId -> collectionItemId haritası.
  // TEK GERÇEK KAYNAK sunucudur: durumu queryFn yan etkisiyle değil, doğrudan
  // query verisinden türetiyoruz. Böylece cache'ten dönülse de (staleTime) state
  // asla "boş"a düşmez. staleTime:0 → ekran her açılışta taze veri çeker (ürün
  // edit ekranından da değişmiş olabilir).
  const { data: serverMap = {}, isLoading: collectionLoading } = useQuery<Record<string, string>>({
    queryKey: ['collection-picker', collectionId],
    staleTime: 0,
    queryFn: async () => {
      const res = await collectionsApi.getOne(collectionId);
      const data = res.data?.data || res.data;
      const map: Record<string, string> = {};
      for (const it of data?.items || []) {
        if (it.productId) map[it.productId] = it.id;
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => l.title?.toLowerCase().includes(q));
  }, [listings, search]);

  const patchPicker = (productId: string, itemId: string | null) => {
    queryClient.setQueryData<Record<string, string>>(
      ['collection-picker', collectionId],
      (old) => {
        const next = { ...(old || {}) };
        if (itemId) next[productId] = itemId;
        else delete next[productId];
        return next;
      },
    );
  };

  const toggle = async (listing: Listing) => {
    if (pending[listing.id]) return;
    const itemId = serverMap[listing.id];
    const adding = !itemId;
    setPending((p) => ({ ...p, [listing.id]: true }));
    // Optimistic: anında işaretle/kaldır. finally'deki invalidate gerçeğe oturtur.
    patchPicker(listing.id, adding ? OPTIMISTIC : null);

    try {
      if (!adding) {
        await collectionsApi.removeItem(collectionId, itemId);
        setSnackbar({ visible: true, message: 'Koleksiyondan çıkarıldı' });
      } else {
        try {
          const res = await collectionsApi.addItem(collectionId, { productId: listing.id });
          const newItem = res.data?.data || res.data;
          if (newItem?.id) patchPicker(listing.id, newItem.id);
          setSnackbar({ visible: true, message: 'Koleksiyona eklendi' });
        } catch (e: any) {
          const msg = e?.response?.data?.message || '';
          // Yarış/eskimiş durum: ürün zaten ekliyse hata gösterme, ekli kabul et.
          // Aşağıdaki invalidate gerçek itemId'yi getirir.
          if (e?.response?.status === 400 && /zaten/i.test(msg)) {
            setSnackbar({ visible: true, message: 'Bu ürün zaten koleksiyonda' });
          } else {
            throw e;
          }
        }
      }
      // Detay/liste ekranlarını tazele (sahip olduğu için viewCount artmaz).
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['myCollections'] });
    } catch (e: any) {
      setSnackbar({
        visible: true,
        message: e?.response?.data?.message || 'İşlem başarısız',
      });
    } finally {
      // Her durumda picker'ı sunucudan doğrula: optimistic işareti gerçek id'ye
      // oturtur ya da başarısız mutasyonu geri alır. Tek gerçek kaynak sunucu.
      await queryClient.invalidateQueries({ queryKey: ['collection-picker', collectionId] });
      setPending((p) => ({ ...p, [listing.id]: false }));
    }
  };

  const isLoading = listingsLoading || collectionLoading;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Ürün Ekle',
          headerStyle: { backgroundColor: colors.primary[600]! },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: 'bold' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />

      <View style={styles.searchBar}>
        <Input
          placeholder="İlanlarında ara..."
          value={search}
          onChangeText={setSearch}
          leftIconName="search"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Spinner size="lg" />
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="cube-outline" size={48} color={colors.text.muted} />
          <Text style={styles.emptyText}>Eklenebilecek aktif ilanın yok</Text>
          <Button
            variant="primary"
            title="İlan Oluştur"
            icon="add"
            onPress={() => router.push('/(tabs)/sell')}
            style={{ marginTop: 16, alignSelf: 'center' }}
          />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={48} color={colors.text.muted} />
          <Text style={styles.emptyText}>Aramanla eşleşen ilan yok</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filtered.map((listing) => {
            const added = !!serverMap[listing.id];
            const busy = !!pending[listing.id];
            return (
              <View key={listing.id} style={styles.row}>
                <TouchableOpacity
                  style={styles.rowContent}
                  onPress={() => router.push(`/product/${listing.id}`)}
                >
                  <Image
                    source={{ uri: resolveImageUrl(listing.images) }}
                    style={styles.thumb}
                  />
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {listing.title}
                    </Text>
                    <Text style={styles.rowPrice}>
                      ₺{(listing.price ?? 0).toLocaleString('tr-TR')}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, added && styles.toggleBtnAdded]}
                  onPress={() => toggle(listing)}
                  disabled={busy}
                  accessibilityLabel={added ? 'Koleksiyondan çıkar' : 'Koleksiyona ekle'}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={added ? colors.white : colors.primary[600]!} />
                  ) : (
                    <Ionicons
                      name={added ? 'checkmark' : 'add'}
                      size={22}
                      color={added ? colors.white : colors.primary[600]!}
                    />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2000}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  searchBar: {
    padding: 16,
    paddingBottom: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.border.DEFAULT,
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  rowPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary[600]!,
    marginTop: 4,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnAdded: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
});
