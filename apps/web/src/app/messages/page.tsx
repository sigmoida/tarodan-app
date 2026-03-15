'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import UserAvatar from '@/components/UserAvatar';
import { useAuthStore } from '@/stores/authStore';
import { messagesApi, listingsApi, api, mediaApi } from '@/lib/api';
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

const IMG_PATTERN = /\[IMG:(https?:\/\/[^\]]+)\]/g;

function parseMessageContent(content: string): Array<{ type: 'text' | 'image'; value: string }> {
  if (!content) return [];
  const parts: Array<{ type: 'text' | 'image'; value: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  IMG_PATTERN.lastIndex = 0;
  while ((m = IMG_PATTERN.exec(content)) !== null) {
    if (m.index > lastIndex) {
      const text = content.slice(lastIndex, m.index).trim();
      if (text) parts.push({ type: 'text', value: text });
    }
    parts.push({ type: 'image', value: m[1] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) parts.push({ type: 'text', value: text });
  }
  return parts.length ? parts : [{ type: 'text', value: content }];
}

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
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  /** Taslak sohbet bazında: sohbet değişince yazı/resim eski sohbette kalır */
  const [draftsByThreadId, setDraftsByThreadId] = useState<Record<string, { text: string; urls: string[] }>>({});
  const [sending, setSending] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [threadsExpanded, setThreadsExpanded] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const currentDraft = selectedThread
    ? (draftsByThreadId[selectedThread.id] ?? { text: '', urls: [] })
    : { text: '', urls: [] };
  const newMessage = currentDraft.text;
  const attachedUrls = currentDraft.urls;
  const contentWarning =
    currentDraft.text.length > 5
      ? (checkContentFilter(currentDraft.text, locale).warning ?? null)
      : null;
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const sellerId = searchParams.get('user');
  const productId = searchParams.get('listing');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !authLoading && !isAuthenticated) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
  }, [mounted, authLoading, isAuthenticated, router]);

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
            avatarUrl: isParticipant1 ? (t.participant2AvatarUrl || null) : (t.participant1AvatarUrl || null),
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

  const INITIAL_THREADS = 6;
  const visibleThreads = threadsExpanded ? threads : threads.slice(0, INITIAL_THREADS);
  const hasMoreThreads = threads.length > INITIAL_THREADS && !threadsExpanded;
  const remainingCount = threads.length - INITIAL_THREADS;

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
      if (productTitle) {
        const prefilled = locale === 'en'
          ? `Hi, I'd like to ask about the "${productTitle}" listing.\n\n`
          : `Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`;
        setDraftsByThreadId((prev) => {
          const existing = prev[existingThread.id];
          if (existing?.text) return prev;
          return { ...prev, [existingThread.id]: { text: prefilled, urls: existing?.urls ?? [] } };
        });
      }
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
        const prefilled = locale === 'en'
          ? `Hi, I'd like to ask about the "${productTitle}" listing.\n\n`
          : `Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`;
        setDraftsByThreadId((prev) => ({ ...prev, [transformedThread.id]: { text: prefilled, urls: [] } }));
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
            const prefilled = `Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`;
            setDraftsByThreadId((prev) => ({ ...prev, [existingThread.id]: { text: prefilled, urls: [] } }));
          }
        }
      } else {
        toast.error(t('common.operationFailed'));
      }
    } finally {
      setCreatingThread(false);
    }
  };

  // Messages are automatically loaded by useQuery when selectedThread changes
  // No need for manual loadMessages call

  const scrollChatToBottom = () => {
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };
  useEffect(() => {
    if (selectedThread && messages.length >= 0) {
      const t = setTimeout(scrollChatToBottom, 80);
      return () => clearTimeout(t);
    }
  }, [messages.length, selectedThread?.id]);

  // loadThreads ve loadMessages fonksiyonları artık kullanılmıyor
  // useQuery hook'ları otomatik olarak yönetiyor
  // Eğer manuel refresh gerekiyorsa queryClient.invalidateQueries kullanılmalı

  const handleMessageChange = (text: string) => {
    if (!selectedThread) return;
    setDraftsByThreadId((prev) => ({
      ...prev,
      [selectedThread.id]: { ...(prev[selectedThread.id] ?? { text: '', urls: [] }), text },
    }));
  };

  const handleAttachImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || attaching || !selectedThread) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast.error(locale === 'en' ? 'Please select an image file' : 'Lütfen bir resim dosyası seçin');
      return;
    }
    setAttaching(true);
    try {
      const res = await mediaApi.uploadMessageImage(file);
      const url = res.data?.url;
      if (url) {
        setDraftsByThreadId((prev) => ({
          ...prev,
          [selectedThread.id]: {
            ...(prev[selectedThread.id] ?? { text: '', urls: [] }),
            urls: [...(prev[selectedThread.id]?.urls ?? []), url],
          },
        }));
      }
    } catch (err) {
      toast.error(locale === 'en' ? 'Failed to upload image' : 'Resim yüklenemedi');
    } finally {
      setAttaching(false);
      e.target.value = '';
    }
  };

  const sendMessage = async () => {
    const text = newMessage.trim();
    const hasAttachments = attachedUrls.length > 0;
    if (!selectedThread || (!text && !hasAttachments) || sending) return;

    const contentToSend = text + (hasAttachments ? '\n\n' + attachedUrls.map((u) => `[IMG:${u}]`).join('\n') : '');

    // Check message length (content includes attachment markers)
    if (contentToSend.length > maxMessageLength) {
      toast.error(
        locale === 'en'
          ? `Message cannot exceed ${maxMessageLength} characters. Current: ${newMessage.length}`
          : `Mesaj ${maxMessageLength} karakteri aşamaz. Mevcut: ${newMessage.length}`
      );
      return;
    }

    // Final content filter check (text only)
    const filterResult = text ? checkContentFilter(text, locale) : { passed: true };
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
      const response = await messagesApi.sendMessage(selectedThread.id, contentToSend);
      const sentMessage = response.data.message || response.data;
      
      // Check if message was filtered by backend
      if (sentMessage.isFiltered || sentMessage.status === 'pending') {
        toast(locale === 'en' ? 'Your message has been sent for review' : 'Mesajınız incelenmek üzere gönderildi', { icon: '⚠️' });
      }

      setDraftsByThreadId((prev) => {
        const next = { ...prev };
        delete next[selectedThread.id];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages', selectedThread.id] }),
        queryClient.invalidateQueries({ queryKey: ['message-threads'] }),
      ]);
      
      setTimeout(scrollChatToBottom, 80);
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

  // Avoid hydration mismatch: render same placeholder until mounted and auth resolved.
  const showPlaceholder = !mounted || authLoading || !isAuthenticated;
  if (showPlaceholder) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-500 text-sm">
            {locale === 'en' ? 'Loading...' : 'Yükleniyor...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <div className="flex-1 flex min-h-0 mx-auto w-full max-w-full lg:max-w-[90%] xl:max-w-[85%] overflow-hidden bg-white border-x border-gray-200 sm:mt-0">
        {/* Sol panel: Konuşma listesi */}
        <div className={`${selectedThread ? 'hidden sm:flex' : 'flex'} w-full sm:w-80 flex-col min-h-0 bg-white border-r border-gray-200`}>
          <div className="flex-shrink-0 px-4 py-4 border-b border-gray-200 bg-white">
            <h1 className="text-lg font-semibold text-gray-900">{t('message.messages')}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {locale === 'en' ? 'Select a conversation' : 'Bir sohbet seçin'}
            </p>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 p-6 text-center text-sm">
              {t('message.noMessages')}
            </div>
          ) : (
            <div className={`flex-1 overflow-y-auto ${threadsExpanded ? '' : 'flex flex-col'}`}>
              {visibleThreads.map((thread) => {
                const isSelected = selectedThread?.id === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedThread(thread)}
                    className={`w-full text-left px-4 py-3 transition-colors border-l-4 border-b border-gray-100 last:border-b-0 ${
                      isSelected
                        ? 'border-l-primary-500 bg-primary-50/60'
                        : 'border-l-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <UserAvatar displayName={thread.otherUser?.displayName} avatarUrl={thread.otherUser?.avatarUrl} size="sm" className="!w-11 !h-11" />
                        {thread.unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-500 rounded-full border-2 border-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900 truncate text-sm">
                            {thread.otherUser?.displayName || 'Kullanıcı'}
                          </span>
                          {thread.unreadCount > 0 && (
                            <span className="flex-shrink-0 text-xs font-medium text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded">
                              {thread.unreadCount}
                            </span>
                          )}
                        </div>
                        {thread.lastMessage && (
                          <p className="text-sm text-gray-500 truncate mt-0.5">
                            {thread.lastMessage.isFromMe ? (locale === 'en' ? 'You: ' : 'Sen: ') : ''}
                            {thread.lastMessage.content}
                          </p>
                        )}
                        {thread.product && (
                          <p className="text-xs text-primary-600 truncate mt-0.5">📦 {thread.product.title}</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {hasMoreThreads && (
                <div className="flex-shrink-0 p-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setThreadsExpanded(true)}
                    className="w-full py-2.5 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    {locale === 'en' ? `More (${remainingCount})` : `Daha fazla (${remainingCount})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sağ panel: Sohbet alanı */}
        <div className={`${selectedThread ? 'flex' : 'hidden sm:flex'} flex-1 flex-col min-h-0 bg-gray-50 min-w-0`}>
          {selectedThread ? (
            <>
              {/* Sohbet başlığı (sabit) */}
              <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3 shadow-sm">
                <button
                  onClick={() => setSelectedThread(null)}
                  className="sm:hidden p-1 -ml-1 mr-1 text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <UserAvatar displayName={selectedThread.otherUser?.displayName} avatarUrl={selectedThread.otherUser?.avatarUrl} size="sm" className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {selectedThread.otherUser?.displayName || 'Kullanıcı'}
                  </p>
                  {selectedThread.product && (
                    <p className="text-xs text-primary-600 truncate">📦 {selectedThread.product.title}</p>
                  )}
                </div>
              </div>

              {/* Mesajlar alanı (scroll) */}
              <div
                ref={messagesScrollRef}
                className="flex-1 min-h-0 overflow-y-auto"
              >
                <div className="p-4 space-y-3">
                  {messages.map((message) => {
                    const isFromMe = message.senderId === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm ${
                            isFromMe
                              ? 'bg-primary-500 text-white rounded-br-md'
                              : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                          } ${
                            message.status === 'pending'
                              ? 'opacity-60'
                              : message.status === 'rejected'
                              ? 'ring-1 ring-red-200 bg-red-50/50'
                              : ''
                          }`}
                        >
                          <div className="text-sm break-words space-y-2">
                            {parseMessageContent(message.content).map((part, i) =>
                              part.type === 'text' ? (
                                <p key={i} className="whitespace-pre-wrap">{part.value}</p>
                              ) : (
                                <a key={i} href={part.value} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden max-w-[240px]">
                                  <img src={part.value} alt="" className="max-w-full max-h-48 object-cover rounded-lg" />
                                </a>
                              )
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 mt-1">
                            <span
                              className={`text-xs ${isFromMe ? 'text-white/80' : 'text-gray-400'}`}
                            >
                              {new Date(message.createdAt).toLocaleTimeString('tr-TR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {message.status === 'pending' && <span className="text-xs">⏳</span>}
                            {message.status === 'rejected' && <span className="text-xs">❌</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div ref={messagesEndRef} />
              </div>

              {/* Yazma kutusu - altta sabit */}
              <div className="flex-shrink-0 p-4 pt-2 bg-white border-t border-gray-200">
                  {contentWarning && (
                    <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                      ⚠️ {contentWarning}
                    </div>
                  )}
                  {attachedUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {attachedUrls.map((url, i) => (
                        <div key={i} className="relative">
                          <img src={url} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedThread) return;
                              setDraftsByThreadId((prev) => ({
                                ...prev,
                                [selectedThread.id]: {
                                  ...(prev[selectedThread.id] ?? { text: '', urls: [] }),
                                  urls: (prev[selectedThread.id]?.urls ?? []).filter((_, j) => j !== i),
                                },
                              }));
                            }}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleAttachImage} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={attaching}
                      title={locale === 'en' ? 'Attach image' : 'Resim ekle'}
                      className="flex-shrink-0 p-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-50"
                    >
                      {attaching ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => handleMessageChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder={t('message.typeMessage')}
                      maxLength={maxMessageLength}
                      className={`flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        contentWarning ? 'border-amber-400 ring-1 ring-amber-200' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={(!newMessage.trim() && !attachedUrls.length) || sending}
                      className="flex-shrink-0 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
                    >
                      {sending ? '...' : t('common.send')}
                    </button>
                  </div>
                  <p className="text-xs text-gray-300 mt-1.5">{newMessage.length}/{maxMessageLength}</p>
              </div>
            </>
          ) : (
            <div className="flex-1 hidden sm:flex flex-col items-center justify-center text-gray-500 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="font-medium text-gray-600">{t('message.selectConversation')}</p>
              <p className="text-sm mt-1">{locale === 'en' ? 'Choose a thread from the list' : 'Listeden bir sohbet seçin'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
