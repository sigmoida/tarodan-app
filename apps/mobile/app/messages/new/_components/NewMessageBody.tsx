import { View, TouchableOpacity, TextInput as RNTextInput } from 'react-native';
import { Avatar, Input, Spinner, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import type { User } from '../_lib/types';
import type { NewMessageController } from '../_hooks/useNewMessage';

const { colors } = theme;

/** Alıcı seçimi + ürün referansı + mesaj kutusu + günlük limit uyarısı. */
export function NewMessageBody({ f }: { f: NewMessageController }) {
  return (
    <View style={styles.content}>
      {/* Recipient Selection */}
      {!f.selectedUser ? (
        <View style={styles.recipientSection}>
          <Text variant="label" style={styles.sectionTitle}>Alıcı</Text>
          <Input
            placeholder="Kullanıcı ara..."
            value={f.searchQuery}
            onChangeText={f.setSearchQuery}
            leftIconName="search"
          />

          {f.searchLoading && (
            <View style={styles.loadingContainer}>
              <Spinner size="sm" />
            </View>
          )}

          {f.searchResults && f.searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {f.searchResults.map((user: User) => (
                <TouchableOpacity key={user.id} style={styles.userItem} onPress={() => f.handleSelectUser(user)}>
                  <Avatar size="md" source={user.avatarUrl} name={user.displayName.charAt(0)} />
                  <View style={styles.userInfo}>
                    <Text variant="body">{user.displayName}</Text>
                    {user.isSeller && <Text variant="caption" style={styles.sellerBadge}>Satıcı</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {f.searchQuery.length >= 2 && !f.searchSupported && (
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
            <Avatar size="md" source={f.selectedUser.avatarUrl} name={f.selectedUser.displayName.charAt(0)} />
            <Text variant="body" style={styles.recipientName}>{f.selectedUser.displayName}</Text>
          </View>
        </View>
      )}

      {/* Product Reference */}
      {(f.product || (f.productId && f.decodedProductTitle)) && (
        <View style={styles.productSection}>
          <Text variant="label" style={styles.sectionTitle}>Ürün Hakkında</Text>
          <TouchableOpacity
            style={styles.productCard}
            onPress={() => router.push(`/product/${f.product?.id || f.productId}`)}
          >
            <Ionicons name="pricetag" size={20} color={colors.primary[600]!} />
            <Text style={styles.productTitle} numberOfLines={1}>
              {f.product?.title || f.decodedProductTitle}
            </Text>
            {f.product?.price && (
              <Text style={styles.productPrice}>₺{f.product.price.toLocaleString('tr-TR')}</Text>
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
            placeholder={f.canSend ? 'Mesajınızı yazın...' : 'Mesaj limiti doldu'}
            placeholderTextColor={colors.text.subtle}
            value={f.messageText}
            onChangeText={f.setMessageText}
            multiline
            maxLength={1000}
            editable={f.canSend}
          />
          <Text style={styles.charCount}>{f.messageText.length}/1000</Text>
        </View>
      </View>

      {/* Daily Limit Warning */}
      {!f.canSend && (
        <View style={styles.limitWarning}>
          <Ionicons name="warning" size={20} color={colors.warning[600]!} />
          <Text style={styles.limitWarningText}>
            Günlük mesaj limitinize ulaştınız ({f.limits?.maxMessagesPerDay || 50} mesaj)
          </Text>
          <TouchableOpacity onPress={() => router.push('/upgrade')}>
            <Text style={styles.upgradeLink}>Premium'a Geç</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
