import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { Portal, Dialog, Button, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, TextInput } from '../common';
import { TarodanColors } from '../../theme';
import { collectionsApi } from '../../services/api';
import { transformImageUrl } from '../../utils/imageUrl';

interface AddToCollectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  productId: string;
  onSuccess?: (collectionName: string) => void;
}

interface CollectionItem {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  itemCount?: number;
  isPublic?: boolean;
}

/**
 * "Koleksiyona Ekle" modal'ı.
 * - Kullanıcının koleksiyonlarını çeker (collectionsApi.getMyCollections).
 * - Birini seçince `collectionsApi.addItem(collectionId, { productId })`.
 * - "Yeni Koleksiyon Oluştur" seçeneği de var.
 *
 * Web `apps/web/src/app/listings/[id]/page.tsx:461-477` referans alındı.
 */
export default function AddToCollectionModal({
  visible,
  onDismiss,
  productId,
  onSuccess,
}: AddToCollectionModalProps) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPublic, setNewPublic] = useState(true);

  const myCollectionsQuery = useQuery({
    queryKey: ['my-collections'],
    queryFn: async () => {
      const response = await collectionsApi.getMyCollections();
      const list: CollectionItem[] = (response.data as any)?.data ?? response.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: visible,
  });
  const collections = myCollectionsQuery.data ?? [];

  const addToCollectionMutation = useMutation({
    mutationFn: ({ collectionId }: { collectionId: string }) =>
      collectionsApi.addItem(collectionId, { productId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      queryClient.invalidateQueries({ queryKey: ['collection', variables.collectionId] });
      const found = collections.find((c) => c.id === variables.collectionId);
      onSuccess?.(found?.name ?? 'Koleksiyon');
      onDismiss();
    },
    onError: (e: any) => {
      Alert.alert(
        'Hata',
        e?.response?.data?.message || 'Ürün koleksiyona eklenemedi.',
      );
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: async () => {
      const response: any = await collectionsApi.create({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        isPublic: newPublic,
      });
      const created = response.data?.data ?? response.data;
      const newId = created?.id;
      if (!newId) throw new Error('Koleksiyon oluşturuldu fakat id alınamadı.');
      // Koleksiyona ürünü ekle
      await collectionsApi.addItem(newId, { productId });
      return { id: newId, name: newName.trim() };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      onSuccess?.(result.name);
      handleClose();
    },
    onError: (e: any) => {
      Alert.alert(
        'Hata',
        e?.response?.data?.message || 'Koleksiyon oluşturulamadı.',
      );
    },
  });

  const handleClose = () => {
    setCreating(false);
    setNewName('');
    setNewDescription('');
    setNewPublic(true);
    onDismiss();
  };

  const handleCreateSubmit = () => {
    if (!newName.trim()) {
      Alert.alert('Eksik', 'Koleksiyon adı girin.');
      return;
    }
    createCollectionMutation.mutate();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleClose} style={styles.dialog}>
        <Dialog.Title>{creating ? 'Yeni Koleksiyon' : 'Koleksiyona Ekle'}</Dialog.Title>

        {creating ? (
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Koleksiyon Adı *"
              value={newName}
              onChangeText={setNewName}
              maxLength={60}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Açıklama (opsiyonel)"
              value={newDescription}
              onChangeText={setNewDescription}
              multiline
              numberOfLines={3}
              maxLength={300}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
              style={styles.input}
            />
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setNewPublic((v) => !v)}
            >
              <Ionicons
                name={newPublic ? 'eye-outline' : 'lock-closed-outline'}
                size={18}
                color={TarodanColors.textSecondary}
              />
              <Text style={styles.toggleText}>
                {newPublic
                  ? 'Herkese Açık (Diğer kullanıcılar görebilir)'
                  : 'Özel (Sadece siz görebilirsiniz)'}
              </Text>
              <Ionicons
                name={newPublic ? 'toggle' : 'toggle-outline'}
                size={26}
                color={newPublic ? TarodanColors.primary : TarodanColors.textTertiary}
              />
            </TouchableOpacity>
          </Dialog.Content>
        ) : (
          <Dialog.ScrollArea style={styles.scrollArea}>
            {myCollectionsQuery.isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={TarodanColors.primary} />
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                <TouchableOpacity
                  style={styles.createNewRow}
                  onPress={() => setCreating(true)}
                >
                  <View style={styles.createIcon}>
                    <Ionicons name="add" size={22} color={TarodanColors.primary} />
                  </View>
                  <Text style={styles.createText}>Yeni Koleksiyon Oluştur</Text>
                </TouchableOpacity>

                {collections.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons
                      name="albums-outline"
                      size={48}
                      color={TarodanColors.textTertiary}
                    />
                    <Text style={styles.emptyText}>
                      Henüz koleksiyonunuz yok. İlk koleksiyonunuzu oluşturarak başlayın.
                    </Text>
                  </View>
                ) : (
                  collections.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.collectionRow}
                      onPress={() =>
                        addToCollectionMutation.mutate({ collectionId: c.id })
                      }
                      disabled={addToCollectionMutation.isPending}
                    >
                      <View style={styles.cover}>
                        {c.coverImageUrl ? (
                          <Image
                            source={{ uri: transformImageUrl(c.coverImageUrl) }}
                            style={styles.coverImage}
                          />
                        ) : (
                          <Ionicons
                            name="albums"
                            size={22}
                            color={TarodanColors.primary}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.collectionName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.collectionMeta}>
                          {c.itemCount ?? 0} ürün ·{' '}
                          {c.isPublic ? 'Herkese açık' : 'Özel'}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={TarodanColors.textTertiary}
                      />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </Dialog.ScrollArea>
        )}

        <Dialog.Actions>
          {creating ? (
            <>
              <Button
                onPress={() => setCreating(false)}
                disabled={createCollectionMutation.isPending}
              >
                Geri
              </Button>
              <Button
                mode="contained"
                buttonColor={TarodanColors.primary}
                onPress={handleCreateSubmit}
                loading={createCollectionMutation.isPending}
                disabled={!newName.trim() || createCollectionMutation.isPending}
              >
                Oluştur ve Ekle
              </Button>
            </>
          ) : (
            <Button onPress={handleClose}>Kapat</Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: TarodanColors.background,
    maxHeight: '85%',
  },
  scrollArea: {
    paddingHorizontal: 0,
    maxHeight: 380,
  },
  loading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  createNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: TarodanColors.primaryLight,
  },
  createIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TarodanColors.background,
    marginRight: 12,
  },
  createText: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.primary,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TarodanColors.borderLight,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  collectionMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  toggleText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.textPrimary,
  },
});
