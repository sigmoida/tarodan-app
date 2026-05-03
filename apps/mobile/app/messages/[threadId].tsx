import { View, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput as RNTextInput, Image, Alert } from 'react-native';
import { Text, Avatar, IconButton, ActivityIndicator, Banner } from 'react-native-paper';
import { useState, useRef, useEffect, useCallback } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMessagesStore, Message } from '../../src/stores/messagesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { mediaApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { useTranslation } from '../../src/i18n';

export default function MessageThreadScreen() {
  const { t } = useTranslation();
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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
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

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Galeri erişimi için izin verin');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingImage(result.assets[0].uri);
    }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !pendingImage) || !threadId || sending || !canSend) return;

    setSending(true);
    let messageContent = inputText.trim();

    if (pendingImage) {
      setImageUploading(true);
      try {
        const formData = new FormData();
        const ext = pendingImage.split('.').pop() || 'jpg';
        formData.append('file', { uri: pendingImage, name: `message_image.${ext}`, type: `image/${ext}` } as any);
        const uploadRes = await mediaApi.uploadMessageImage(formData);
        const imageUrl = uploadRes.data?.url || uploadRes.data?.data?.url;
        if (imageUrl) {
          messageContent = messageContent ? `[IMG:${imageUrl}] ${messageContent}` : `[IMG:${imageUrl}]`;
        }
      } catch {
        Alert.alert('Hata', 'Görsel yüklenemedi');
        setSending(false);
        setImageUploading(false);
        return;
      }
      setImageUploading(false);
    }

    if (messageContent) {
      const success = await sendMessage(threadId, messageContent);
      if (success) {
        setInputText('');
        setPendingImage(null);
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
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
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.headerContent}
          onPress={() => other && router.push(`/seller/${other.id}`)}
        >
          {other?.avatarUrl ? (
            <Avatar.Image size={40} source={{ uri: other.avatarUrl }} />
          ) : (
            <Avatar.Text size={40} label={other?.displayName?.charAt(0) || '?'} />
          )}
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
          icon="dots-vertical"
          iconColor={TarodanColors.textOnPrimary}
          onPress={() => {}}
        />
      </View>

      {/* Product Banner */}
      {currentThread?.product && (
        <TouchableOpacity 
          style={styles.productBanner}
          onPress={() => router.push(`/product/${currentThread.product?.id}`)}
        >
          <Ionicons name="pricetag" size={16} color={TarodanColors.primary} />
          <Text style={styles.productBannerText} numberOfLines={1}>
            {currentThread.product.title}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={TarodanColors.textSecondary} />
        </TouchableOpacity>
      )}

      {/* Message Limit Warning */}
      {!isUnlimited && !canSend && (
        <Banner
          visible={true}
          icon="alert-circle"
          style={styles.limitBanner}
          actions={[
            { label: 'Premium\'a Geç', onPress: () => router.push('/upgrade') }
          ]}
        >
          Günlük mesaj limitinize ulaştınız ({messageLimit} mesaj). Premium üyelikle sınırsız mesaj gönderin.
        </Banner>
      )}

      {/* Messages */}
      {isLoadingMessages && messages.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
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
                        {showAvatar && other?.avatarUrl ? (
                          <Avatar.Image size={28} source={{ uri: other.avatarUrl }} />
                        ) : showAvatar ? (
                          <Avatar.Text size={28} label={other?.displayName?.charAt(0) || '?'} />
                        ) : null}
                      </View>
                    )}
                    
                    <View style={[
                      styles.messageBubble,
                      isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther,
                    ]}>
                      {(() => {
                        const imgMatch = message.content?.match(/\[IMG:(.*?)\]/);
                        const textPart = message.content?.replace(/\[IMG:.*?\]\s*/g, '').trim();
                        return (
                          <>
                            {imgMatch && imgMatch[1] && (
                              <Image
                                source={{ uri: imgMatch[1] }}
                                style={{ width: 200, height: 150, borderRadius: 8, marginBottom: textPart ? 6 : 0 }}
                                resizeMode="cover"
                              />
                            )}
                            {textPart ? (
                              <Text style={[
                                styles.messageText,
                                isOwn ? styles.messageTextOwn : styles.messageTextOther,
                              ]}>{textPart}</Text>
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

      {/* Pending Image Preview */}
      {pendingImage && (
        <View style={styles.imagePreviewBar}>
          <Image source={{ uri: pendingImage }} style={styles.imagePreviewThumb} />
          <Text style={{ flex: 1, fontSize: 12, color: TarodanColors.textSecondary, marginLeft: 8 }}>{t("mobile.imageAttached")}</Text>
          <TouchableOpacity onPress={() => setPendingImage(null)}>
            <Ionicons name="close-circle" size={24} color={TarodanColors.error} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.imagePickButton} onPress={pickImage} disabled={sending || imageUploading}>
          <Ionicons name="image-outline" size={24} color={canSend ? TarodanColors.primary : TarodanColors.textLight} />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <RNTextInput
            style={styles.textInput}
            placeholder={canSend ? "Mesajınızı yazın..." : "Mesaj limiti doldu"}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            editable={canSend}
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
            color={(!inputText.trim() || !canSend) ? TarodanColors.textLight : TarodanColors.textOnPrimary} 
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
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
    color: TarodanColors.textOnPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TarodanColors.textOnPrimary + 'CC',
  },
  productBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  productBannerText: {
    flex: 1,
    marginHorizontal: 8,
    color: TarodanColors.textPrimary,
    fontSize: 13,
  },
  limitBanner: {
    backgroundColor: TarodanColors.warningLight,
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
    backgroundColor: TarodanColors.border,
  },
  dateDividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
    color: TarodanColors.textSecondary,
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
    backgroundColor: TarodanColors.primary,
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: TarodanColors.background,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: TarodanColors.textOnPrimary,
  },
  messageTextOther: {
    color: TarodanColors.textPrimary,
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
    color: TarodanColors.textOnPrimary + 'AA',
  },
  messageTimeOther: {
    color: TarodanColors.textSecondary,
  },
  messageStatus: {
    marginLeft: 4,
    fontSize: 11,
    color: TarodanColors.textOnPrimary + 'AA',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: TarodanColors.background,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 16,
    color: TarodanColors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TarodanColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  imagePickButton: {
    width: 40,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  imagePreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: TarodanColors.surfaceVariant,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  imagePreviewThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
});
