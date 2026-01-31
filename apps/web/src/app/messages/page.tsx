'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { messagesApi, listingsApi, api } from '@/lib/api';
import { useTranslation } from '@/i18n';

interface MessageThread {
  id: string;
  otherUser: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  lastMessage?: {
    content: string;
    createdAt: string;
    isFromMe: boolean;
  };
  unreadCount: number;
  product?: {
    id: string;
    title: string;
    imageUrl?: string;
  };
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  status: 'sent' | 'delivered' | 'read' | 'pending' | 'rejected';
  isFiltered?: boolean;
  filterReason?: string;
}

// Client-side content filter patterns (basic check)
const PROHIBITED_PATTERNS = [
  /\b(banka|hesap|iban)\b.*\b(numar|no)\b/gi,
  /\b(telefon|tel|gsm)\b.*\b(\d{10,})\b/gi,
  /\b(e[-]?posta|mail|email)\b.*@/gi,
  /\b(whatsapp|wp|telegram)\b/gi,
];

const checkContentFilter = (text: string, locale: string): { passed: boolean; warning?: string } => {
  const lowerText = text.toLowerCase();
  
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(lowerText)) {
      return {
        passed: false,
        warning: locale === 'en' 
          ? 'Personal contact information detected in your message. Communication outside the platform is not recommended for your safety.'
          : 'Mesajınızda kişisel iletişim bilgisi tespit edildi. Platform dışı iletişim güvenliğiniz için önerilmez.',
      };
    }
    pattern.lastIndex = 0; // Reset regex
  }
  
  return { passed: true };
};

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { t, locale } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [contentWarning, setContentWarning] = useState<string | null>(null);
  const [creatingThread, setCreatingThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sellerId = searchParams.get('user');
  const productId = searchParams.get('listing');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
  }, [isAuthenticated, router]);

  const messageSettingsQuery = useQuery({
    queryKey: ['message-settings'],
    queryFn: async () => {
      const response = await api.get('/admin/settings/public');
      return response.data || {};
    },
    enabled: isAuthenticated,
    meta: { page: 'message-settings' },
  });
  const maxMessageLength = messageSettingsQuery.data?.max_message_length ?? 1000;

  const threadsQuery = useQuery({
    queryKey: ['message-threads'],
    queryFn: async (): Promise<MessageThread[]> => {
      const response = await messagesApi.getThreads();
      const rawThreads = response.data.data || response.data.threads || [];
      return rawThreads.map((t: any) => {
        if (t.otherUser) return t;
        const isParticipant1 = t.participant1Id === user?.id;
        return {
          ...t,
          otherUser: {
            id: isParticipant1 ? t.participant2Id : t.participant1Id,
            displayName: isParticipant1 ? (t.participant2Name || (locale === 'en' ? 'User' : 'Kullanıcı')) : (t.participant1Name || (locale === 'en' ? 'User' : 'Kullanıcı')),
            avatarUrl: null,
          },
          lastMessage: t.lastMessage ? {
            ...t.lastMessage,
            isFromMe: t.lastMessage.senderId === user?.id,
          } : undefined,
          product: t.productId ? {
            id: t.productId,
            title: t.productTitle || (locale === 'en' ? 'Product' : 'Ürün'),
            imageUrl: t.productImage,
          } : undefined,
        };
      });
    },
    enabled: isAuthenticated,
    meta: { page: 'message-threads' },
  });
  const threads = threadsQuery.data ?? [];
  const loading = threadsQuery.isLoading;

  const messagesQuery = useQuery({
    queryKey: ['messages', selectedThread?.id],
    queryFn: async (): Promise<Message[]> => {
      const response = await messagesApi.getMessages(selectedThread!.id);
      const messages = response.data.data || response.data.messages || [];
      return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    },
    enabled: isAuthenticated && !!selectedThread?.id,
    meta: { page: 'messages' },
  });
  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    if (selectedThread?.id && messagesQuery.isSuccess) {
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    }
  }, [selectedThread?.id, messagesQuery.isSuccess, queryClient]);

  useEffect(() => {
    if (sellerId && isAuthenticated && !threadsQuery.isLoading && !creatingThread) {
      handleCreateThreadForProduct();
    }
  }, [sellerId, isAuthenticated, threadsQuery.isLoading]);

  const handleCreateThreadForProduct = async () => {
    if (!sellerId || creatingThread) return;
    
    // Fetch product details if productId is provided
    let productTitle = '';
    if (productId) {
      try {
        const productResponse = await listingsApi.getOne(productId);
        const product = productResponse.data.product || productResponse.data;
        productTitle = product.title || (locale === 'en' ? 'Product' : 'Ürün');
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to fetch product:', error);
      }
    }
    
    // Check if a thread already exists with this seller (and optionally product)
    const existingThread = threads.find(t => 
      t.otherUser?.id === sellerId && 
      (!productId || t.product?.id === productId)
    );

    if (existingThread) {
      setSelectedThread(existingThread);
      // Pre-fill message with product reference
      if (productTitle && !newMessage) {
        setNewMessage(locale === 'en' 
          ? `Hi, I'd like to ask about the "${productTitle}" listing.\n\n`
          : `Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`);
      }
      // Clear URL params without triggering a reload
      window.history.replaceState({}, '', '/messages');
      return;
    }

    // Create a new thread
    setCreatingThread(true);
    try {
      const response = await messagesApi.createThread({
        participantId: sellerId,
        productId: productId || undefined,
      });
      
      const newThread = response.data.thread || response.data;
      
      // Transform the thread to match our interface
      const transformedThread: MessageThread = {
        id: newThread.id,
        otherUser: {
          id: sellerId,
          displayName: newThread.otherUser?.displayName || (locale === 'en' ? 'Seller' : 'Satıcı'),
          avatarUrl: newThread.otherUser?.avatarUrl,
        },
        unreadCount: 0,
        product: productId ? {
          id: productId,
          title: productTitle || (locale === 'en' ? 'Product' : 'Ürün'),
        } : undefined,
      };

      await queryClient.invalidateQueries({ queryKey: ['message-threads'] });
      setSelectedThread(transformedThread);
      
      if (productTitle) {
        setNewMessage(locale === 'en'
          ? `Hi, I'd like to ask about the "${productTitle}" listing.\n\n`
          : `Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`);
      }
      
      window.history.replaceState({}, '', '/messages');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to create thread:', error);
      if (error.response?.status === 409) {
        await queryClient.refetchQueries({ queryKey: ['message-threads'] });
        const list = (queryClient.getQueryData(['message-threads']) as MessageThread[] | undefined) ?? [];
        const existingThread = list.find((t) => t.otherUser?.id === sellerId);
        if (existingThread) {
          setSelectedThread(existingThread);
          if (productTitle) {
            setNewMessage(`Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`);
          }
        }
      } else {
        toast.error(t('common.operationFailed'));
      }
    } finally {
      setCreatingThread(false);
    }
  };

  const handleMessageChange = (text: string) => {
    setNewMessage(text);
    
    // Check content filter on input
    if (text.length > 5) {
      const filterResult = checkContentFilter(text, locale);
      setContentWarning(filterResult.warning || null);
    } else {
      setContentWarning(null);
    }
  };

  const sendMessage = async () => {
    if (!selectedThread || !newMessage.trim() || sending) return;

    // Check message length
    if (newMessage.length > maxMessageLength) {
      toast.error(
        locale === 'en'
          ? `Message cannot exceed ${maxMessageLength} characters. Current: ${newMessage.length}`
          : `Mesaj ${maxMessageLength} karakteri aşamaz. Mevcut: ${newMessage.length}`
      );
      return;
    }

    // Final content filter check
    const filterResult = checkContentFilter(newMessage, locale);
    if (!filterResult.passed) {
      const confirm = window.confirm(
        locale === 'en'
          ? `${filterResult.warning}\n\nDo you still want to send it?`
          : `${filterResult.warning}\n\nYine de göndermek istiyor musunuz?`
      );
      if (!confirm) return;
    }

    setSending(true);
    try {
      const response = await messagesApi.sendMessage(selectedThread.id, newMessage.trim());
      const sentMessage = response.data.message || response.data;
      
      // Check if message was filtered by backend
      if (sentMessage.isFiltered || sentMessage.status === 'pending') {
        toast(locale === 'en' ? 'Your message has been sent for review' : 'Mesajınız incelenmek üzere gönderildi', { icon: '⚠️' });
      }

      setNewMessage('');
      setContentWarning(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages', selectedThread.id] }),
        queryClient.invalidateQueries({ queryKey: ['message-threads'] }),
      ]);
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      if (error.response?.data?.requiresApproval) {
        toast(locale === 'en' ? 'Your message has been sent for review' : 'Mesajınız incelenmek üzere gönderildi', { icon: '⚠️' });
      } else if (error.response?.data?.filtered) {
        toast.error(locale === 'en' ? 'Your message has been blocked due to inappropriate content' : 'Mesajınız uygunsuz içerik nedeniyle engellenmiştir');
      } else {
        toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to send message' : 'Mesaj gönderilemedi'));
      }
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Thread List */}
        <div className="w-80 border-r border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h1 className="text-xl font-semibold">{t('message.messages')}</h1>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
            </div>
          ) : threads.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 p-4 text-center">
              {t('message.noMessages')}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  className={`w-full p-4 text-left hover:bg-gray-800 transition-colors border-b border-gray-700 ${
                    selectedThread?.id === thread.id ? 'bg-gray-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      {thread.otherUser?.avatarUrl ? (
                        <img
                          src={thread.otherUser.avatarUrl}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        (thread.otherUser?.displayName || 'K').charAt(0)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium truncate">
                          {thread.otherUser?.displayName || 'Kullanıcı'}
                        </p>
                        {thread.unreadCount > 0 && (
                          <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
                            {thread.unreadCount}
                          </span>
                        )}
                      </div>
                      {thread.lastMessage && (
                        <p className="text-sm text-gray-400 truncate">
                          {thread.lastMessage.isFromMe ? 'Sen: ' : ''}
                          {thread.lastMessage.content}
                        </p>
                      )}
                      {thread.product && (
                        <p className="text-xs text-primary-400 truncate">
                          📦 {thread.product.title}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedThread ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-700 flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center">
                  {(selectedThread.otherUser?.displayName || 'K').charAt(0)}
                </div>
                <div>
                  <p className="font-medium">{selectedThread.otherUser?.displayName || 'Kullanıcı'}</p>
                  {selectedThread.product && (
                    <p className="text-sm text-primary-400">
                      {selectedThread.product.title}
                    </p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => {
                  const isFromMe = message.senderId === user?.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                          isFromMe
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-700 text-white'
                        } ${
                          message.status === 'pending'
                            ? 'opacity-50'
                            : message.status === 'rejected'
                            ? 'bg-red-900/50'
                            : ''
                        }`}
                      >
                        <p>{message.content}</p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-xs opacity-70">
                            {new Date(message.createdAt).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {message.status === 'pending' && (
                            <span className="text-xs">⏳</span>
                          )}
                          {message.status === 'rejected' && (
                            <span className="text-xs">❌</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-700">
                {contentWarning && (
                  <div className="mb-2 p-2 bg-yellow-900/50 border border-yellow-600 rounded-lg text-yellow-300 text-sm">
                    ⚠️ {contentWarning}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => handleMessageChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder={t('message.typeMessage')}
                    maxLength={maxMessageLength}
                    className={`flex-1 px-4 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400 ${
                      contentWarning ? 'border border-yellow-500' : ''
                    } ${
                      newMessage.length > maxMessageLength * 0.9
                        ? 'border border-orange-500'
                        : ''
                    }`}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {sending ? '...' : t('common.send')}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    ℹ️ {t('message.blockedContent')}
                  </p>
                  <p className={`text-xs ${
                    newMessage.length > maxMessageLength
                      ? 'text-red-400'
                      : newMessage.length > maxMessageLength * 0.9
                      ? 'text-orange-400'
                      : 'text-gray-500'
                  }`}>
                    {newMessage.length} / {maxMessageLength}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              {t('message.selectConversation')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
