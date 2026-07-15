import { View, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resolveImageUrl } from '@/utils/imageUrl';
import { styles } from '../_lib/styles';
import type { Listing } from '../_lib/types';
import type { AddItemsController } from '../_hooks/useAddItems';

const { colors } = theme;

/** Tek ilan satırı — foto/başlık/fiyat + ekle/çıkar toggle (optimistic). */
export function ListingPickerRow({ listing, f }: { listing: Listing; f: AddItemsController }) {
  const added = !!f.effectiveItemId(listing.id);
  const busy = !!f.pending[listing.id];

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowContent} onPress={() => router.push(`/product/${listing.id}`)}>
        <Image source={{ uri: resolveImageUrl(listing.images) }} style={styles.thumb} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowTitle} numberOfLines={2}>{listing.title}</Text>
          <Text style={styles.rowPrice}>₺{(listing.price ?? 0).toLocaleString('tr-TR')}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.toggleBtn, added && styles.toggleBtnAdded]}
        onPress={() => f.toggle(listing)}
        disabled={busy}
        accessibilityLabel={added ? 'Koleksiyondan çıkar' : 'Koleksiyona ekle'}
      >
        {busy ? (
          <ActivityIndicator size="small" color={added ? colors.white : colors.primary[600]!} />
        ) : (
          <Ionicons name={added ? 'checkmark' : 'add'} size={22} color={added ? colors.white : colors.primary[600]!} />
        )}
      </TouchableOpacity>
    </View>
  );
}
