import { View, Image, TouchableOpacity } from 'react-native';
import { Avatar, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { transformImageUrl } from '@/utils/imageUrl';
import { styles } from '../_lib/browseStyles';

const { colors } = theme;

/** Tarama grid'inde tek koleksiyon kartı — kapak/istatistik + ad/açıklama/sahip. */
export function CollectionBrowseCard({ item }: { item: any }) {
  return (
    <TouchableOpacity style={styles.collectionCard} onPress={() => router.push(`/collections/${item.id}`)}>
      <Image
        source={{ uri: transformImageUrl(item.coverImageUrl ?? item.coverImage) }}
        style={styles.collectionImage}
        resizeMode="cover"
      />
      <View style={styles.collectionOverlay}>
        <View style={styles.collectionStats}>
          <View style={styles.collectionStat}>
            <Ionicons name="images-outline" size={14} color={colors.white} />
            <Text style={styles.collectionStatText}>{item.itemCount}</Text>
          </View>
          <View style={styles.collectionStat}>
            <Ionicons name="heart" size={14} color={colors.white} />
            <Text style={styles.collectionStatText}>{item.likeCount}</Text>
          </View>
        </View>
      </View>
      <View style={styles.collectionInfo}>
        <Text style={styles.collectionName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.collectionDescription} numberOfLines={2}>{item.description}</Text>
        <View style={styles.ownerRow}>
          <Avatar size="sm" name={item.userName || 'U'} />
          <Text style={styles.ownerName}>{item.userName}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
