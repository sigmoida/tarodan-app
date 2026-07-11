import { View } from 'react-native';
import { Spinner, EmptyState } from '@tarodan/ui-native';
import { router, Stack } from 'expo-router';

import { styles } from './_lib/collectionEditStyles';
import { useCollectionEdit } from './_hooks/useCollectionEdit';
import { CollectionEditBody } from './_components/CollectionEditBody';

/**
 * Collection edit — THIN screen. The `useCollectionEdit` controller owns the
 * query, RHF form, and update/delete/remove-item mutations; this file renders
 * the loading / not-found / not-owner gates and delegates the body.
 */
export default function EditCollectionScreen() {
  const f = useCollectionEdit();

  if (f.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
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

  // Check ownership
  if (f.collection && f.user && f.collection.userId !== f.user.id) {
    return (
      <EmptyState
        fullscreen
        icon="lock-closed-outline"
        title="Bu koleksiyonu düzenleme yetkiniz yok"
        actionLabel="Geri Dön"
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Koleksiyonu Düzenle' }} />
      <CollectionEditBody f={f} />
    </>
  );
}
