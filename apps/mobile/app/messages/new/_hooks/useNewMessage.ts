import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useMessagesStore } from '@/stores/messagesStore';
import { useCreateThread } from '@/hooks/messaging';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '../_lib/types';

/**
 * New-message controller — owns recipient preselect (seller/product/trade
 * context), the optional product query, the message draft (pre-filled from a
 * product), and the createThread send flow. Lifted verbatim from the monolithic
 * screen (§12). NOTE: manuel kullanıcı arama backend'de yok → devre dışı.
 */
export function useNewMessage() {
  const { sellerId, receiverId, productId, productTitle } = useLocalSearchParams<{
    sellerId?: string;
    receiverId?: string;
    productId?: string;
    productTitle?: string;
  }>();
  const canSendMessage = useMessagesStore((s) => s.canSendMessage);
  const createThread = useCreateThread();
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
      : '',
  );
  const [sending, setSending] = useState(false);

  const canSend = canSendMessage();

  // NOT: Backend'de isimle kullanıcı arama ucu (GET /users/search) YOK; web'de de bu
  // özellik bulunmuyor. Bozuk uca 404 atmak yerine manuel aramayı devre dışı bırakıyoruz.
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
    const isUuid =
      !!productId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    try {
      const thread = await createThread.mutateAsync({
        recipientId: selectedUser.id,
        content: messageText.trim(),
        productId: isUuid ? productId : undefined,
      });
      router.replace(`/messages/${thread.id}`);
    } catch {
      setSending(false);
    }
  };

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setSearchQuery('');
  };

  // Geri git; stack kökündeysek (deep link / replace ile gelinmişse) mesajlara düş.
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/messages' as never);
  };

  return {
    limits,
    productId,
    product,
    decodedProductTitle,
    searchQuery,
    setSearchQuery,
    selectedUser,
    messageText,
    setMessageText,
    sending,
    canSend,
    searchResults,
    searchLoading,
    searchSupported,
    handleSend,
    handleSelectUser,
    handleBack,
  };
}

export type NewMessageController = ReturnType<typeof useNewMessage>;
