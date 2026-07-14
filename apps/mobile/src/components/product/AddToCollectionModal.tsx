import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { theme, Text, Button, Modal, Input, Textarea, Spinner, useModalMessage, ModalMessage } from '@tarodan/ui-native';
import { collectionsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { transformImageUrl } from '../../utils/imageUrl';

const { colors } = theme;

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
  const msg = useModalMessage();

  useEffect(() => {
    msg.clear();
  }, [visible]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPublic, setNewPublic] = useState(true);

  const myCollectionsQuery = useQuery({
    queryKey: qk.collections.mine,
    queryFn: async () => {
      const response = await collectionsApi.getMyCollections();
      // /collections/me => { collections: [...], total, page, pageSize }
      // (profile.tsx / collections/index.tsx ile aynı şekil okunmalı)
      const body = response.data as any;
      const list: CollectionItem[] =
        body?.collections ?? body?.data ?? (Array.isArray(body) ? body : []);
      return Array.isArray(list) ? list : [];
    },
    enabled: visible,
  });
  const collections = myCollectionsQuery.data ?? [];

  // Koleksiyon ekleme/oluşturma sonrası TÜM koleksiyon görünümlerini tazele:
  // liste (qk.collections.mine — artık ayarlar listesi de bu anahtarı kullanıyor,
  // eski ['myCollections'] adası #78'de birleştirildi), profil garajı + sayaç
  // (profile-collections) ve koleksiyon detayı.
  const invalidateCollectionQueries = (collectionId?: string) => {
    queryClient.invalidateQueries({ queryKey: qk.collections.mine });
    queryClient.invalidateQueries({ queryKey: ['profile-collections'] });
    if (collectionId) {
      queryClient.invalidateQueries({ queryKey: qk.collections.detail(collectionId) });
    }
  };

  const addToCollectionMutation = useMutation({
    mutationFn: ({ collectionId }: { collectionId: string }) =>
      collectionsApi.addItem(collectionId, { productId }),
    onSuccess: (_data, variables) => {
      invalidateCollectionQueries(variables.collectionId);
      const found = collections.find((c) => c.id === variables.collectionId);
      onSuccess?.(found?.name ?? 'Koleksiyon');
      onDismiss();
    },
    onError: (e: any) => {
      msg.error(e?.response?.data?.message || 'Ürün koleksiyona eklenemedi.');
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
      invalidateCollectionQueries(result.id);
      onSuccess?.(result.name);
      handleClose();
    },
    onError: (e: any) => {
      msg.error(e?.response?.data?.message || 'Koleksiyon oluşturulamadı.');
    },
  });

  const handleClose = () => {
    msg.clear();
    setCreating(false);
    setNewName('');
    setNewDescription('');
    setNewPublic(true);
    onDismiss();
  };

  const handleCreateSubmit = () => {
    msg.clear();
    if (!newName.trim()) {
      msg.error('Koleksiyon adı girin.');
      return;
    }
    createCollectionMutation.mutate();
  };

  return (
    <Modal isOpen={visible} onClose={handleClose} title={creating ? 'Yeni Koleksiyon' : 'Koleksiyona Ekle'}>
      {creating ? (
        <View>
          <Input
            label="Koleksiyon Adı *"
            value={newName}
            onChangeText={setNewName}
            maxLength={60}
            containerStyle={styles.input}
          />
          <Textarea
            label="Açıklama (opsiyonel)"
            value={newDescription}
            onChangeText={setNewDescription}
            rows={3}
            maxLength={300}
            containerStyle={styles.input}
          />
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setNewPublic((v) => !v)}
          >
            <Ionicons
              name={newPublic ? 'eye-outline' : 'lock-closed-outline'}
              size={18}
              color={colors.text.muted}
            />
            <Text style={styles.toggleText}>
              {newPublic
                ? 'Herkese Açık (Diğer kullanıcılar görebilir)'
                : 'Özel (Sadece siz görebilirsiniz)'}
            </Text>
            <Ionicons
              name={newPublic ? 'toggle' : 'toggle-outline'}
              size={26}
              color={newPublic ? colors.primary[600]! : colors.text.subtle}
            />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.scrollArea}>
          {myCollectionsQuery.isLoading ? (
            <View style={styles.loading}>
              <Spinner size="lg" />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.createNewRow}
                onPress={() => setCreating(true)}
              >
                <View style={styles.createIcon}>
                  <Ionicons name="add" size={22} color={colors.primary[600]!} />
                </View>
                <Text style={styles.createText}>Yeni Koleksiyon Oluştur</Text>
              </TouchableOpacity>

              {collections.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons
                    name="albums-outline"
                    size={48}
                    color={colors.text.subtle}
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
                          color={colors.primary[600]!}
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
                      color={colors.text.subtle}
                    />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>
      )}

      <View style={styles.actions}>
        {creating ? (
          <>
            <Button
              variant="ghost"
              title="Geri"
              onPress={() => setCreating(false)}
              disabled={createCollectionMutation.isPending}
            />
            <Button
              variant="primary"
              title="Oluştur ve Ekle"
              onPress={handleCreateSubmit}
              isLoading={createCollectionMutation.isPending}
              disabled={!newName.trim() || createCollectionMutation.isPending}
            />
          </>
        ) : (
          <Button variant="ghost" title="Kapat" onPress={handleClose} />
        )}
      </View>
      <ModalMessage state={msg.state} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: 380,
  },
  loading: {
    paddingVertical: theme.spacing[8],
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
  createNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
    backgroundColor: colors.primary[50]!,
  },
  createIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.DEFAULT,
    marginRight: theme.spacing[3],
  },
  createText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary[600]!,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.xl,
    backgroundColor: colors.surface.alt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing[3],
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  collectionMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: theme.spacing[0.5],
  },
  input: {
    marginBottom: theme.spacing[3],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  toggleText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.heading,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
});
