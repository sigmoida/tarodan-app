import { View, StyleSheet, TouchableOpacity, TextInput as RNTextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Avatar, Button, Input, Spinner, Text, theme, ScreenHeader } from '@tarodan/ui-native';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useMessagesStore } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';

const { colors } = theme;

interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isSeller?: boolean;
}

export default function NewMessageScreen() {
  const { t } = useTranslation();
  const { sellerId, receiverId, productId, productTitle } = useLocalSearchParams<{ sellerId?: string; receiverId?: string; productId?: string; productTitle?: string }>();
  const { canSendMessage, createThread } = useMessagesStore();
  const { limits } = useAuthStore();

  // Recipient can arrive as `sellerId` (seller/product context) or `receiverId` (trade context).
  const recipientId = sellerId || receiverId;

  const decodedProductTitle = productTitle ? decodeURIComponent(productTitle) : '';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messageText, setMessageText] = useState(
    // Pre-fill message if coming from a product page
    productId && decodedProductTitle
      ? `Merhaba, "${decodedProductTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`
      : ''
  );
  const [sending, setSending] = useState(false);

  const canSend = canSendMessage();

  // NOT: Backend'de isimle kullanıcı arama ucu (GET /users/search) YOK; web'de de bu
  // özellik bulunmuyor (mesajlar yalnızca participantId/sellerId ile açılır). Bozuk uca
  // 404 isteği atmak yerine manuel aramayı devre dışı bırakıp kullanıcıyı bilgilendiriyoruz.
  // Alıcı, ürün/satıcı/takas akışından gelen recipientId ile otomatik seçilir.
  const searchResults: User[] = [];
  const searchLoading = false;
  const searchSupported = false;

  // Fetch recipient profile if a recipient id is provided (seller, product, or trade context)
  const { data: preselectedUser } = useQuery({
    queryKey: ['user', recipientId],
    queryFn: async () => {
      if (!recipientId) return null;
      try {
        const response = await api.get(`/users/${recipientId}/profile`);
        const profile = response.data?.data || response.data;
        if (!profile?.id) return null;
        return {
          id: profile.id,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          isSeller: profile.isSeller,
        } as User;
      } catch (error) {
        return null;
      }
    },
    enabled: !!recipientId && !selectedUser,
  });

  // Set preselected user
  useEffect(() => {
    if (preselectedUser && !selectedUser) {
      setSelectedUser(preselectedUser);
    }
  }, [preselectedUser, selectedUser]);

  // Fetch product details if productId is provided
  const { data: product } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      if (!productId) return null;
      try {
        const response = await api.get(`/products/${productId}`);
        return response.data;
      } catch (error) {
        return null;
      }
    },
    enabled: !!productId,
  });

  const handleSend = async () => {
    if (!selectedUser || !messageText.trim() || sending || !canSend) return;

    setSending(true);
    // API CreateThreadDto productId'yi @IsUUID('4') ile zorunlu kılıyor — UUID değilse
    // göndermeyelim, yoksa thread oluşturma ham 400 "Geçerli bir ürün ID giriniz" döner.
    const isUuid = !!productId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    const threadId = await createThread(
      selectedUser.id,
      messageText.trim(),
      isUuid ? productId : undefined
    );

    if (threadId) {
      router.replace(`/messages/${threadId}`);
    } else {
      setSending(false);
    }
  };

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setSearchQuery('');
  };

  // Geri git; stack kökündeysek (deep link / replace ile gelinmişse) mesajlara düş.
  // Düz router.back() bu durumda "GO_BACK was not handled by any navigator" hatası verir.
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/messages' as never);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={t('mobile.messagesNew')} onBack={handleBack} />

      {/* Content */}
      <View style={styles.content}>
        {/* Recipient Selection */}
        {!selectedUser ? (
          <View style={styles.recipientSection}>
            <Text variant="label" style={styles.sectionTitle}>Alıcı</Text>
            <Input
              placeholder="Kullanıcı ara..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              leftIconName="search"
            />

            {searchLoading && (
              <View style={styles.loadingContainer}>
                <Spinner size="sm" />
              </View>
            )}

            {searchResults && searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.map((user: User) => (
                  <TouchableOpacity
                    key={user.id}
                    style={styles.userItem}
                    onPress={() => handleSelectUser(user)}
                  >
                    <Avatar
                      size="md"
                      source={user.avatarUrl}
                      name={user.displayName.charAt(0)}
                    />
                    <View style={styles.userInfo}>
                      <Text variant="body">{user.displayName}</Text>
                      {user.isSeller && (
                        <Text variant="caption" style={styles.sellerBadge}>Satıcı</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searchQuery.length >= 2 && !searchSupported && (
              <Text style={styles.noResults}>
                İsimle kullanıcı arama şu anda desteklenmiyor. Mesaj göndermek için bir ilan
                veya satıcı profilinden "Mesaj Gönder" seçeneğini kullanın.
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.selectedRecipient}>
            <Text variant="label" style={styles.sectionTitle}>Alıcı</Text>
            <View style={styles.recipientCard}>
              <Avatar
                size="md"
                source={selectedUser.avatarUrl}
                name={selectedUser.displayName.charAt(0)}
              />
              <Text variant="body" style={styles.recipientName}>
                {selectedUser.displayName}
              </Text>
            </View>
          </View>
        )}

        {/* Product Reference */}
        {(product || (productId && decodedProductTitle)) && (
          <View style={styles.productSection}>
            <Text variant="label" style={styles.sectionTitle}>Ürün Hakkında</Text>
            <TouchableOpacity
              style={styles.productCard}
              onPress={() => router.push(`/product/${product?.id || productId}`)}
            >
              <Ionicons name="pricetag" size={20} color={colors.primary[600]!} />
              <Text style={styles.productTitle} numberOfLines={1}>
                {product?.title || decodedProductTitle}
              </Text>
              {product?.price && (
                <Text style={styles.productPrice}>₺{product.price.toLocaleString('tr-TR')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Message Input */}
        <View style={styles.messageSection}>
          <Text variant="label" style={styles.sectionTitle}>Mesaj</Text>
          <View style={styles.messageInputContainer}>
            <RNTextInput
              style={styles.messageInput}
              placeholder={canSend ? "Mesajınızı yazın..." : "Mesaj limiti doldu"}
              placeholderTextColor={colors.text.subtle}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={1000}
              editable={canSend}
            />
            <Text style={styles.charCount}>{messageText.length}/1000</Text>
          </View>
        </View>

        {/* Daily Limit Warning */}
        {!canSend && (
          <View style={styles.limitWarning}>
            <Ionicons name="warning" size={20} color={colors.warning[600]!} />
            <Text style={styles.limitWarningText}>
              Günlük mesaj limitinize ulaştınız ({limits?.maxMessagesPerDay || 50} mesaj)
            </Text>
            <TouchableOpacity onPress={() => router.push('/upgrade')}>
              <Text style={styles.upgradeLink}>Premium'a Geç</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Send Button */}
      <View style={styles.footer}>
        <Button
          variant="primary"
          fullWidth
          size="lg"
          title="Gönder"
          onPress={handleSend}
          disabled={!selectedUser || !messageText.trim() || !canSend || sending}
          isLoading={sending}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    color: colors.text.heading,
  },
  recipientSection: {
    marginBottom: 24,
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  searchResults: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
    overflow: 'hidden',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  userInfo: {
    marginLeft: 12,
  },
  sellerBadge: {
    color: colors.primary[600]!,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 16,
    color: colors.text.muted,
  },
  selectedRecipient: {
    marginBottom: 24,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
  },
  recipientName: {
    flex: 1,
    marginLeft: 12,
  },
  productSection: {
    marginBottom: 24,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.primary[50]!,
    borderRadius: 8,
  },
  productTitle: {
    flex: 1,
    marginHorizontal: 8,
    color: colors.text.heading,
  },
  productPrice: {
    fontWeight: '600',
    color: colors.primary[600]!,
  },
  messageSection: {
    flex: 1,
  },
  messageInputContainer: {
    flex: 1,
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
    padding: 12,
    minHeight: 150,
  },
  messageInput: {
    flex: 1,
    fontSize: 16,
    textAlignVertical: 'top',
    color: colors.text.heading,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
  },
  limitWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  limitWarningText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 13,
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  sendButton: {
    borderRadius: 8,
  },
});
