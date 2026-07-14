import { useState, useRef, useEffect, useCallback } from 'react';
import { FlatList, Platform } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { appAlert } from '@tarodan/ui-native';
import { useMessagesStore } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
import { useThreadQuery, useMessagesQuery, useSendMessage, useMarkAsRead } from '@/hooks/messaging';
import { detectViolations, getViolationMessage } from '@/utils/contentFilter';
import { mediaApi, userApi } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { groupMessagesByDate } from '../_lib/helpers';

/**
 * Message-thread controller — thread/messages artık React Query (#77), send/markRead
 * mutation hook'ları. Aktif thread `setCurrentThreadId` ile store'a yazılır (socket
 * köprüsü açık/kapalı ayrımı için). getOtherParticipant + canSendMessage client store.
 */
export function useMessageThread() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { user, limits } = useAuthStore();
  const getOtherParticipant = useMessagesStore((s) => s.getOtherParticipant);
  const canSendMessage = useMessagesStore((s) => s.canSendMessage);
  const setCurrentThreadId = useMessagesStore((s) => s.setCurrentThreadId);
  const { data: currentThread = null } = useThreadQuery(threadId);
  const { data: messages = [], isLoading: isLoadingMessages } = useMessagesQuery(threadId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Seçilen foto gönderilmeden önce input üstünde önizlenir; kullanıcı onaylayınca gönderilir.
  const [pendingImage, setPendingImage] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [filterWarning, setFilterWarning] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  // İlk açılışta liste en alta konumlanana dek gizli tutulur (zıplama görünmesin).
  const [isPositioned, setIsPositioned] = useState(false);
  const scrollViewRef = useRef<FlatList>(null);

  const messageLimit = limits?.maxMessagesPerDay || 50;
  const isUnlimited = messageLimit === -1;
  const canSend = canSendMessage();

  // Thread/messages query'leri enabled:threadId ile kendiliğinden çeker. Focus'ta:
  // aktif thread'i işaretle (socket köprüsü için), okundu yap, socket odasına gir.
  useFocusEffect(
    useCallback(() => {
      if (threadId) {
        setCurrentThreadId(threadId);
        markAsRead.mutate(threadId);
        getSocket()?.emit('join:thread', { threadId });
      }
      return () => {
        if (threadId) {
          getSocket()?.emit('leave:thread', { threadId });
          setCurrentThreadId(null);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId])
  );

  // Thread değişince ilk konumlama sıfırlanır
  useEffect(() => {
    setIsPositioned(false);
  }, [threadId]);

  // İlk yüklemede animasyonsuz en alta konumla (liste o ana dek gizli);
  // sonraki içerik değişimlerinde (yeni mesaj) yumuşak kaydır.
  const handleContentSizeChange = () => {
    if (!isPositioned) {
      // Boş konuşma (yüklenmiş, mesaj yok) da "konumlanmış" sayılır.
      if (messages.length > 0 || !isLoadingMessages) {
        scrollViewRef.current?.scrollToEnd({ animated: false });
        setIsPositioned(true);
      }
    } else {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  /**
   * Resim seç → önizleme olarak input üstüne ekle. Gönderim, kullanıcı
   * gönder butonuna basınca handleSend içinde yapılır (yanlışlıkla
   * direkt gönderim olmasın diye onay adımı).
   */
  const handleAttachImage = async () => {
    if (!threadId || uploadingImage || sending || !canSend) return;

    // İzin iste
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert('İzin Gerekli', 'Resim göndermek için galeri erişim izni gerekli.');
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

    setPendingImage({
      uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
      name: filename,
      type,
    });
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if ((!trimmed && !pendingImage) || !threadId || sending || uploadingImage || !canSend) return;

    // Platform dışı iletişim tespiti (telefon, email, IBAN, WhatsApp vs.)
    if (trimmed) {
      const violations = detectViolations(trimmed);
      if (violations.length > 0) {
        setFilterWarning(getViolationMessage(violations));
        setTimeout(() => setFilterWarning(null), 5000);
        return;
      }
    }

    setSending(true);
    try {
      let content = trimmed;

      // Önizlenen foto varsa önce yükle, "[IMG:url]" formatında mesaja ekle.
      // Web `apps/web/src/app/messages/page.tsx:337` ile aynı format.
      if (pendingImage) {
        setUploadingImage(true);
        try {
          const response = await mediaApi.uploadMessageImage(pendingImage as any);
          const url = (response.data as any)?.url ?? (response.data as any)?.data?.url;
          if (!url) throw new Error('Resim yüklendi fakat URL alınamadı.');
          content = trimmed ? `${trimmed} [IMG:${url}]` : `[IMG:${url}]`;
        } catch (e: any) {
          appAlert('Hata', e?.response?.data?.message || 'Resim gönderilemedi.');
          return;
        } finally {
          setUploadingImage(false);
        }
      }

      try {
        await sendMessage.mutateAsync({ threadId, content });
        setInputText('');
        setPendingImage(null);
      } catch (e: any) {
        appAlert(
          'Mesaj gönderilemedi',
          e?.message || e?.response?.data?.message || 'Lütfen tekrar deneyin.'
        );
      }
    } finally {
      setSending(false);
    }
  };

  const groupedMessages = groupMessagesByDate(messages);
  const other = currentThread ? getOtherParticipant(currentThread) : null;

  const handleBlockUser = () => {
    if (!other) return;
    appAlert(
      'Kullanıcıyı Engelle',
      `${other.displayName} engellenecek. Bu kullanıcı size mesaj gönderemez ve ilanlarınızı göremez.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Engelle',
          style: 'destructive',
          onPress: async () => {
            try {
              await userApi.block(other.id);
              appAlert('Engellendi', `${other.displayName} engellendi.`);
              router.canGoBack() ? router.back() : router.replace('/(tabs)');
            } catch {
              appAlert('Hata', 'Kullanıcı engellenirken bir sorun oluştu.');
            }
          },
        },
      ]
    );
  };

  const handleHeaderMenu = () => {
    if (!other) return;
    appAlert(other.displayName, undefined, [
      { text: 'Profili Görüntüle', onPress: () => router.push(`/seller/${other.id}`) },
      // iOS'ta alert modalı kapanırken yeni bir native Modal açılırsa görünmeyebilir; kapanışı bekle.
      { text: 'Şikayet Et', onPress: () => setTimeout(() => setShowReportModal(true), 300) },
      { text: 'Engelle', style: 'destructive', onPress: handleBlockUser },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  };

  return {
    user,
    currentThread,
    messages,
    isLoadingMessages,
    // input state
    inputText,
    setInputText,
    sending,
    uploadingImage,
    pendingImage,
    setPendingImage,
    filterWarning,
    showReportModal,
    setShowReportModal,
    isPositioned,
    scrollViewRef,
    // limit
    messageLimit,
    isUnlimited,
    canSend,
    // derived
    groupedMessages,
    other,
    // handlers
    handleContentSizeChange,
    handleAttachImage,
    handleSend,
    handleHeaderMenu,
  };
}

export type MessageThreadController = ReturnType<typeof useMessageThread>;
