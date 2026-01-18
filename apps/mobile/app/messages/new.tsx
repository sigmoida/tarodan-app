import { View, StyleSheet, TouchableOpacity, TextInput as RNTextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Searchbar, Avatar, ActivityIndicator, Button } from 'react-native-paper';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useMessagesStore } from '../../src/stores/messagesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

interface User {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isSeller?: boolean;
}

export default function NewMessageScreen() {
  const { sellerId, productId, productTitle } = useLocalSearchParams<{ sellerId?: string; productId?: string; productTitle?: string }>();
  const { canSendMessage, createThread } = useMessagesStore();
  const { limits } = useAuthStore();
  
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

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['users', 'search', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      try {
        const response = await api.get('/users/search', { params: { q: searchQuery } });
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Search failed');
        return [];
      }
    },
    enabled: searchQuery.length >= 2,
  });

  // Fetch seller details if sellerId is provided
  const { data: preselectedUser } = useQuery({
    queryKey: ['user', sellerId],
    queryFn: async () => {
      if (!sellerId) return null;
      try {
        const response = await api.get(`/users/${sellerId}`);
        return response.data;
      } catch (error) {
        return null;
      }
    },
    enabled: !!sellerId && !selectedUser,
  });

  // Set preselected user
  if (preselectedUser && !selectedUser) {
    setSelectedUser(preselectedUser);
  }

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
    const threadId = await createThread(
      selectedUser.id, 
      messageText.trim(), 
      productId || undefined
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

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yeni Mesaj</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Recipient Selection */}
        {!selectedUser ? (
          <View style={styles.recipientSection}>
            <Text variant="titleSmall" style={styles.sectionTitle}>Alıcı</Text>
            <Searchbar
              placeholder="Kullanıcı ara..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchbar}
            />
            
            {searchLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={TarodanColors.primary} />
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
                    {user.avatarUrl ? (
                      <Avatar.Image size={40} source={{ uri: user.avatarUrl }} />
                    ) : (
                      <Avatar.Text size={40} label={user.displayName.charAt(0)} />
                    )}
                    <View style={styles.userInfo}>
                      <Text variant="bodyMedium">{user.displayName}</Text>
                      {user.isSeller && (
                        <Text variant="bodySmall" style={styles.sellerBadge}>Satıcı</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searchQuery.length >= 2 && !searchLoading && (!searchResults || searchResults.length === 0) && (
              <Text style={styles.noResults}>Kullanıcı bulunamadı</Text>
            )}
          </View>
        ) : (
          <View style={styles.selectedRecipient}>
            <Text variant="titleSmall" style={styles.sectionTitle}>Alıcı</Text>
            <View style={styles.recipientCard}>
              {selectedUser.avatarUrl ? (
                <Avatar.Image size={40} source={{ uri: selectedUser.avatarUrl }} />
              ) : (
                <Avatar.Text size={40} label={selectedUser.displayName.charAt(0)} />
              )}
              <Text variant="bodyMedium" style={styles.recipientName}>
                {selectedUser.displayName}
              </Text>
              <TouchableOpacity onPress={() => setSelectedUser(null)}>
                <Ionicons name="close-circle" size={24} color={TarodanColors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Product Reference */}
        {(product || (productId && decodedProductTitle)) && (
          <View style={styles.productSection}>
            <Text variant="titleSmall" style={styles.sectionTitle}>Ürün Hakkında</Text>
            <TouchableOpacity 
              style={styles.productCard}
              onPress={() => router.push(`/product/${product?.id || productId}`)}
            >
              <Ionicons name="pricetag" size={20} color={TarodanColors.primary} />
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
          <Text variant="titleSmall" style={styles.sectionTitle}>Mesaj</Text>
          <View style={styles.messageInputContainer}>
            <RNTextInput
              style={styles.messageInput}
              placeholder={canSend ? "Mesajınızı yazın..." : "Mesaj limiti doldu"}
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
            <Ionicons name="warning" size={20} color={TarodanColors.warning} />
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
          mode="contained"
          onPress={handleSend}
          disabled={!selectedUser || !messageText.trim() || !canSend || sending}
          loading={sending}
          style={styles.sendButton}
          contentStyle={styles.sendButtonContent}
        >
          Gönder
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 8,
    color: TarodanColors.textPrimary,
  },
  recipientSection: {
    marginBottom: 24,
  },
  searchbar: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  searchResults: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
    overflow: 'hidden',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  userInfo: {
    marginLeft: 12,
  },
  sellerBadge: {
    color: TarodanColors.primary,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 16,
    color: TarodanColors.textSecondary,
  },
  selectedRecipient: {
    marginBottom: 24,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: TarodanColors.surfaceVariant,
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
    backgroundColor: TarodanColors.primaryLight + '20',
    borderRadius: 8,
  },
  productTitle: {
    flex: 1,
    marginHorizontal: 8,
    color: TarodanColors.textPrimary,
  },
  productPrice: {
    fontWeight: '600',
    color: TarodanColors.primary,
  },
  messageSection: {
    flex: 1,
  },
  messageInputContainer: {
    flex: 1,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 8,
    padding: 12,
    minHeight: 150,
  },
  messageInput: {
    flex: 1,
    fontSize: 16,
    textAlignVertical: 'top',
    color: TarodanColors.textPrimary,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 8,
  },
  limitWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.warningLight,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  limitWarningText: {
    flex: 1,
    color: TarodanColors.warning,
    fontSize: 13,
  },
  upgradeLink: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
    backgroundColor: TarodanColors.background,
  },
  sendButton: {
    borderRadius: 8,
  },
  sendButtonContent: {
    paddingVertical: 8,
  },
});
