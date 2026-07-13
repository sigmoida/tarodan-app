import { View, Image, TouchableOpacity } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import type { LikedCollection } from '../_lib/types';
import type { LikedCollectionsController } from '../_hooks/useLikedCollections';

const { colors } = theme;

/** Tek beğenilen koleksiyon kartı — kapak, istatistik, beğeniyi kaldır. */
export function LikedCollectionCard({
  collection,
  f,
}: {
  collection: LikedCollection;
  f: LikedCollectionsController;
}) {
  return (
    <TouchableOpacity
      style={styles.collectionCard}
      onPress={() => router.push(`/collections/${collection.id}`)}
    >
      <Image source={{ uri: f.getImageUrl(collection) }} style={styles.collectionImage} resizeMode="cover" />
      <View style={styles.collectionOverlay}>
        <View style={styles.collectionStats}>
          <View style={styles.collectionStat}>
            <Ionicons name="images-outline" size={12} color={colors.white} />
            <Text style={styles.collectionStatText}>{collection.itemCount || 0}</Text>
          </View>
          <View style={styles.collectionStat}>
            <Ionicons name="heart" size={12} color={colors.white} />
            <Text style={styles.collectionStatText}>{collection.likeCount || 0}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.unlikeButton}
          onPress={(e) => {
            e.stopPropagation();
            f.handleUnlike(collection.id);
          }}
        >
          <Ionicons name="heart-dislike" size={16} color={colors.white} />
        </TouchableOpacity>
      </View>
      <View style={styles.collectionInfo}>
        <Text style={styles.collectionName} numberOfLines={1}>{collection.name}</Text>
        {collection.userName ? (
          <Text style={styles.ownerName} numberOfLines={1}>{collection.userName}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
