'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { messagesApi, listingsApi } from '@/lib/api';
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
  const { t, locale } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contentWarning, setContentWarning] = useState<string | null>(null);
  const [creatingThread, setCreatingThread] = useState(false);
  const [threadsExpanded, setThreadsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const INITIAL_THREADS = 6;
  const visibleThreads = threadsExpanded ? threads : threads.slice(0, INITIAL_THREADS);
  const hasMoreThreads = threads.length > INITIAL_THREADS && !threadsExpanded;
  const remainingCount = threads.length - INITIAL_THREADS;

  // URL params for product-specific messaging
  const sellerId = searchParams.get('user');
  const productId = searchParams.get('listing');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    loadThreads();
  }, [isAuthenticated]);

  // Handle creating a new thread when coming from a product page
  useEffect(() => {
    if (sellerId && isAuthenticated && !loading && !creatingThread) {
      handleCreateThreadForProduct();
    }
  }, [sellerId, isAuthenticated, loading]);

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
        console.error('Failed to fetch product:', error);
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

      setThreads(prev => [transformedThread, ...prev]);
      setSelectedThread(transformedThread);
      
      // Pre-fill message with product reference
      if (productTitle) {
        setNewMessage(locale === 'en'
          ? `Hi, I'd like to ask about the "${productTitle}" listing.\n\n`
          : `Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`);
      }
      
      // Clear URL params
      window.history.replaceState({}, '', '/messages');
    } catch (error: any) {
      console.error('Failed to create thread:', error);
      // If thread already exists, try to find it in the threads
      if (error.response?.status === 409) {
        await loadThreads();
        const existingThread = threads.find(t => t.otherUser?.id === sellerId);
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

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
    }
  }, [selectedThread]);

  // Sadece sohbet alanını en alta kaydır (sayfa kaymasın); mesajlar yüklendiğinde / yeni mesajda
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

  const loadThreads = async () => {
    try {
      const response = await messagesApi.getThreads();
      const rawThreads = response.data.data || response.data.threads || [];
      
      // Transform API response to include otherUser object
      // Backend returns participant1Id/participant2Id, not otherUser
      const transformedThreads = rawThreads.map((t: any) => {
        // If otherUser already exists (properly formatted), use it
        if (t.otherUser) {
          return t;
        }
        
        // Otherwise, transform from participant1/participant2 format
        const isParticipant1 = t.participant1Id === user?.id;
        return {
          ...t,
          otherUser: {
            id: isParticipant1 ? t.participant2Id : t.participant1Id,
            displayName: isParticipant1 ? (t.participant2Name || (locale === 'en' ? 'User' : 'Kullanıcı')) : (t.participant1Name || (locale === 'en' ? 'User' : 'Kullanıcı')),
            avatarUrl: null, // Backend doesn't provide avatarUrl in threads
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
      
      setThreads(transformedThreads);
    } catch (error) {
      console.error('Threads load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (threadId: string) => {
    try {
      const response = await messagesApi.getMessages(threadId);
      const messages = response.data.data || response.data.messages || [];
      // Backend returns messages in desc order (newest first), but chat should show oldest first
      // Sort by createdAt ascending (oldest to newest)
      const sortedMessages = [...messages].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB; // Ascending order (oldest first)
      });
      setMessages(sortedMessages);
      
      // Refresh thread list to update unread counts (backend marks messages as read when loading)
      await loadThreads();
    } catch (error) {
      console.error('Messages load error:', error);
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

      setMessages((prev) => [...prev, sentMessage]);
      setNewMessage('');
      setContentWarning(null);
      loadThreads(); // Refresh threads to update last message
      
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

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <div className="flex-1 flex min-h-0 max-w-4xl mx-auto w-full shadow-lg rounded-none sm:rounded-lg overflow-hidden bg-white mt-0 sm:mt-4 mb-4">
        {/* Sol panel: Konuşma listesi (e-ticaret tarzı) */}
        <div className="w-full sm:w-80 flex flex-col min-h-0 bg-white border-r border-gray-200">
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
                        <div className="w-11 h-11 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm overflow-hidden">
                          {thread.otherUser?.avatarUrl ? (
                            <img
                              src={thread.otherUser.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (thread.otherUser?.displayName || '?').charAt(0).toUpperCase()
                          )}
                        </div>
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
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50 min-w-0">
          {selectedThread ? (
            <>
              {/* Sohbet başlığı (sabit) */}
              <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                  {(selectedThread.otherUser?.displayName || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {selectedThread.otherUser?.displayName || 'Kullanıcı'}
                  </p>
                  {selectedThread.product && (
                    <p className="text-xs text-primary-600 truncate">📦 {selectedThread.product.title}</p>
                  )}
                </div>
              </div>

              {/* Mesajlar + yazma kutusu (son mesajın hemen altında, tek kaydırma alanı) */}
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
                          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
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
                {/* Mesaj yazma kutusu: son mesajın hemen altında; kısa sohbette kaydırmaya gerek kalmaz */}
                <div className="p-4 pt-2 bg-white border-t border-gray-200">
                  {contentWarning && (
                    <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                      ⚠️ {contentWarning}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => handleMessageChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder={t('message.typeMessage')}
                      className={`flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        contentWarning ? 'border-amber-400 ring-1 ring-amber-200' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sending}
                      className="flex-shrink-0 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
                    >
                      {sending ? '...' : t('common.send')}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">ℹ️ {t('message.blockedContent')}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
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
