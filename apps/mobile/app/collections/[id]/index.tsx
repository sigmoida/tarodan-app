import { View } from 'react-native';
import { Spinner, Text, EmptyState } from '@tarodan/ui-native';
import { router } from 'expo-router';

import { styles } from './_lib/collectionStyles';
import { useCollectionDetail } from './_hooks/useCollectionDetail';
import { CollectionDetailBody } from './_components/CollectionDetailBody';

/**
 * Collection detail — THIN screen. The `useCollectionDetail` controller owns the
 * query, optimistic like, share, and owner/premium flags; this file renders the
 * loading/not-found gates and delegates the body.
 */
export default function CollectionDetailScreen() {
  const f = useCollectionDetail();

  if (f.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!f.collection) {
    return (
      <EmptyState
        fullscreen
        icon="albums-outline"
        title="Koleksiyon bulunamadı"
        actionLabel="Geri Dön"
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
    );
  }

  return <CollectionDetailBody f={f} />;
}
