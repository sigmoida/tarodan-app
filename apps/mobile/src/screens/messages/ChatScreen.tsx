/**
 * Chat Screen
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  created_at: string;
  is_filtered: boolean;
}

const ChatScreen = ({ route }: any) => {
  const { userId, listingId, tradeId } = route.params;
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadMessages();
    // Poll for new messages
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadMessages = async () => {
    try {
      const response = await api.getMessages(listingId, tradeId);
      // Filter messages for this conversation
      const filtered = (response.messages || []).filter(
        (msg: Message) =>
          (msg.sender_id === userId || msg.receiver_id === userId)
      );
      setMessages(filtered.reverse());
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    setIsSending(true);
    try {
      await api.sendMessage({
        receiver_id: userId,
        content: inputText.trim(),
        listing_id: listingId,
        trade_id: tradeId,
      });
      setInputText('');
      loadMessages();
    } catch (error: any) {
      if (error.response?.data?.filtered) {
        Alert.alert(
          'Mesaj Filtrelendi',
          'Mesajınız kişisel iletişim bilgileri içerdiği için gönderilemedi. Lütfen platform üzerinden iletişime devam edin.'
        );
      } else {
        Alert.alert('Hata', 'Mesaj gönderilemedi');
      }
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Bugün';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Dün';
    } else {
      return date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwnMessage = item.sender_id === user?.id;
    const showDateSeparator =
      index === messages.length - 1 ||
      new Date(messages[index + 1]?.created_at).toDateString() !==
        new Date(item.created_at).toDateString();

    return (
      <>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{formatDate(item.created_at)}</Text>
          </View>
        )}
        <View
          style={[
            styles.messageContainer,
            isOwnMessage ? styles.ownMessage : styles.otherMessage,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              isOwnMessage ? styles.ownBubble : styles.otherBubble,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
              ]}
            >
              {item.content}
            </Text>
            <Text
              style={[
                styles.messageTime,
                isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime,
              ]}
            >
              {formatTime(item.created_at)}
              {isOwnMessage && (
                <Icon
                  name="checkmark-done"
                  size={14}
                  color="rgba(255,255,255,0.7)"
                  style={{ marginLeft: 4 }}
                />
              )}
            </Text>
          </View>
        </View>
      </>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.messagesContainer}
        inverted
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="chatbubble-outline" size={48} color="#BDBDBD" />
            <Text style={styles.emptyText}>Henüz mesaj yok</Text>
            <Text style={styles.emptyHint}>İlk mesajı gönderin</Text>
          </View>
        }
      />

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Mesaj yazın..."
          placeholderTextColor="#9E9E9E"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Icon name="send" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Icon name="shield-checkmark" size={16} color="#757575" />
        <Text style={styles.warningText}>
          Güvenliğiniz için telefon ve e-posta paylaşmayın
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    padding: 16,
    flexGrow: 1,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: '#9E9E9E',
    backgroundColor: '#EEEEEE',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  messageContainer: {
    marginBottom: 8,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  ownBubble: {
    backgroundColor: '#E53935',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#FFF',
  },
  otherMessageText: {
    color: '#212121',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownMessageTime: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: '#9E9E9E',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#212121',
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9C4',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  warningText: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: '#9E9E9E',
    marginTop: 4,
  },
});

export default ChatScreen;


