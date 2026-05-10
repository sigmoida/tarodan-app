import { View, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput as RNTextInput, Image as RNImage, Alert } from 'react-native';
import { Avatar, IconButton, Spinner, Alert as UIAlert, Text, theme } from '@tarodan/ui-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMessagesStore, Message } from '../../src/stores/messagesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { detectViolations, getViolationMessage, parseMessageContent } from '../../src/utils/contentFilter';
import { mediaApi } from '../../src/services/api';

const { colors } = theme;

export default function MessageThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { user, limits } = useAuthStore();
  const {
    currentThread,
    messages,
    isLoadingMessages,
    fetchThread,
    fetchMessages,
    sendMessage,
    markAsRead,
    getOtherParticipant,
    canSendMessage,
    dailyMessageCount,
  } = useMessagesStore();

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [filterWarning, setFilterWarning] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const messageLimit = limits?.maxMessagesPerDay || 50;
  const isUnlimited = messageLimit === -1;
  const canSend = canSendMessage();

  // Fetch thread and messages on mount
  useFocusEffect(
    useCallback(() => {
      if (threadId) {
        fetchThread(threadId);
        fetchMessages(threadId);
        markAsRead(threadId);
      }
    }, [threadId])
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  /**
   * Resim seç → mediaApi.uploadMessageImage → "[IMG:url]" formatında mesaj gönder.
   * Web `apps/web/src/app/messages/page.tsx:337` ile aynı akış.
   */
  const handleAttachImage = async () => {
    if (!threadId || uploadingImage || !canSend) return;

    // İzin iste
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin Gerekli', 'Resim göndermek için galeri erişim izni gerekli.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const filename = asset.uri.split('/').pop() || `image_${Date.now()}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const type = asset.mimeType || (match ? `image/${match[1]}` : 'image/jpeg');

    const file = {
      uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
      name: filename,
      type,
    };

    setUploadingImage(true);
    try {
      const response = await mediaApi.uploadMessageImage(file as any);
      const url = (response.data as any)?.url ?? (response.data as any)?.data?.url;
      if (!url) throw new Error('Resim yüklendi fakat URL alınamadı.');

      // Mevcut input metnini koru, sonuna [IMG:url] ekle
      const base = inputText.trim();
      const content = base ? `${base} [IMG:${url}]` : `[IMG:${url}]`;
      const success = await sendMessage(threadId, content);
      if (success) {
        setInputText('');
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.response?.data?.message || 'Resim gönderilemedi.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !threadId || sending || !canSend) return;

    const trimmed = inputText.trim();

    // Platform dışı iletişim tespiti (telefon, email, IBAN, WhatsApp vs.)
    const violations = detectViolations(trimmed);
    if (violations.length > 0) {
      setFilterWarning(getViolationMessage(violations));
      setTimeout(() => setFilterWarning(null), 5000);
      return;
    }

    setSending(true);
    const success = await sendMessage(threadId, trimmed);
    if (success) {
      setInputText('');
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
    setSending(false);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Bugün';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Dün';
    } else {
      return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    }
  };

  const getMessageStatus = (status: Message['status']) => {
    switch (status) {
      case 'sent': return '✓';
      case 'delivered': return '✓✓';
      case 'read': return '✓✓';
      case 'pending_approval': return '⏳';
      case 'rejected': return '❌';
      default: return '';
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  messages.forEach(message => {
    const messageDate = formatDate(message.createdAt);
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      groupedMessages.push({ date: messageDate, messages: [message] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(message);
    }
  });

  const other = currentThread ? getOtherParticipant(currentThread) : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerContent}
          onPress={() => other && router.push(`/seller/${other.id}`)}
        >
          <Avatar
            size="md"
            source={other?.avatarUrl || undefined}
            name={other?.displayName?.charAt(0) || '?'}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{other?.displayName || 'Yükleniyor...'}</Text>
            {currentThread?.product && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {currentThread.product.title}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <IconButton
          icon="ellipsis-vertical"
          accessibilityLabel="Daha fazla"
          size="md"
          onPress={() => {}}
        />
      </View>

      {/* Product Banner */}
      {currentThread?.product && (
        <TouchableOpacity
          style={styles.productBanner}
          onPress={() => router.push(`/product/${currentThread.product?.id}`)}
        >
          <Ionicons name="pricetag" size={16} color={colors.primary[600]!} />
          <Text style={styles.productBannerText} numberOfLines={1}>
            {currentThread.product.title}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      )}

      {/* Message Limit Warning */}
      {!isUnlimited && !canSend && (
        <UIAlert variant="warning">
          Günlük mesaj limitinize ulaştınız ({messageLimit} mesaj). Premium üyelikle sınırsız mesaj gönderin.
        </UIAlert>
      )}

      {/* İçerik filtresi uyarısı */}
      {filterWarning ? (
        <UIAlert variant="warning">
          {filterWarning}
        </UIAlert>
      ) : null}

      {/* Messages */}
      {isLoadingMessages && messages.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
        >
          {groupedMessages.map((group, groupIndex) => (
            <View key={groupIndex}>
              {/* Date Divider */}
              <View style={styles.dateDivider}>
                <View style={styles.dateDividerLine} />
                <Text style={styles.dateDividerText}>{group.date}</Text>
                <View style={styles.dateDividerLine} />
              </View>

              {/* Messages for this date */}
              {group.messages.map((message, messageIndex) => {
                const isOwn = message.senderId === user?.id;
                const showAvatar = !isOwn && (
                  messageIndex === 0 ||
                  group.messages[messageIndex - 1]?.senderId !== message.senderId
                );

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      isOwn ? styles.messageRowOwn : styles.messageRowOther,
                    ]}
                  >
                    {!isOwn && (
                      <View style={styles.avatarPlaceholder}>
                        {showAvatar ? (
                          <Avatar
                            size="sm"
                            source={other?.avatarUrl || undefined}
                            name={other?.displayName?.charAt(0) || '?'}
                          />
                        ) : null}
                      </View>
                    )}

                    <View style={[
                      styles.messageBubble,
                      isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
                    ]}>
                      {(() => {
                        const parsed = parseMessageContent(message.content || '');
                        return (
                          <>
                            {parsed.images.length > 0 ? (
                              <View style={styles.messageImagesWrap}>
                                {parsed.images.map((img, idx) => (
                                  <RNImage
                                    key={`${message.id}-img-${idx}`}
                                    source={{ uri: img }}
                                    style={styles.messageImage}
                                    resizeMode="cover"
                                  />
                                ))}
                              </View>
                            ) : null}
                            {parsed.text ? (
                              <Text style={[
                                styles.messageText,
                                isOwn ? styles.messageTextOwn : styles.messageTextOther,
                              ]}>
                                {parsed.text}
                              </Text>
                            ) : null}
                          </>
                        );
                      })()}
                      <View style={styles.messageFooter}>
                        <Text style={[
                          styles.messageTime,
                          isOwn ? styles.messageTimeOwn : styles.messageTimeOther,
                        ]}>
                          {formatTime(message.createdAt)}
                        </Text>
                        {isOwn && (
                          <Text style={styles.messageStatus}>
                            {getMessageStatus(message.status)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={[
            styles.attachButton,
            (!canSend || uploadingImage) && styles.attachButtonDisabled,
          ]}
          onPress={handleAttachImage}
          disabled={!canSend || uploadingImage}
        >
          {uploadingImage ? (
            <Spinner size="sm" />
          ) : (
            <Ionicons
              name="image-outline"
              size={24}
              color={canSend ? colors.primary[600]! : colors.text.subtle}
            />
          )}
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <RNTextInput
            style={styles.textInput}
            placeholder={canSend ? "Mesajınızı yazın..." : "Mesaj limiti doldu"}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            editable={canSend && !uploadingImage}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || !canSend || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || !canSend || sending}
        >
          <Ionicons
            name="send"
            size={24}
            color={(!inputText.trim() || !canSend) ? colors.text.subtle : colors.white}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.overlay.white85,
  },
  productBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  productBannerText: {
    flex: 1,
    marginHorizontal: 8,
    color: colors.text.heading,
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  dateDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dateDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.DEFAULT,
  },
  dateDividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
    color: colors.text.muted,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  avatarPlaceholder: {
    width: 36,
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  messageBubbleOwn: {
    backgroundColor: colors.primary[600]!,
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: colors.surface.DEFAULT,
    borderBottomLeftRadius: 4,
  },
  messageImagesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  messageImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: colors.white,
  },
  messageTextOther: {
    color: colors.text.heading,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    justifyContent: 'flex-end',
  },
  messageTime: {
    fontSize: 11,
  },
  messageTimeOwn: {
    color: colors.overlay.white70,
  },
  messageTimeOther: {
    color: colors.text.muted,
  },
  messageStatus: {
    marginLeft: 4,
    fontSize: 11,
    color: colors.overlay.white70,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: colors.surface.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: colors.surface.alt,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 16,
    color: colors.text.heading,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface.alt,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface.alt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
});
