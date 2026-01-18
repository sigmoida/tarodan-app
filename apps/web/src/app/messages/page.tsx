'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { messagesApi, listingsApi } from '@/lib/api';

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

const checkContentFilter = (text: string): { passed: boolean; warning?: string } => {
  const lowerText = text.toLowerCase();
  
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(lowerText)) {
      return {
        passed: false,
        warning: 'Mesajınızda kişisel iletişim bilgisi tespit edildi. Platform dışı iletişim güvenliğiniz için önerilmez.',
      };
    }
    pattern.lastIndex = 0; // Reset regex
  }
  
  return { passed: true };
};

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contentWarning, setContentWarning] = useState<string | null>(null);
  const [creatingThread, setCreatingThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        productTitle = product.title || 'Ürün';
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
        setNewMessage(`Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`);
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
          displayName: newThread.otherUser?.displayName || 'Satıcı',
          avatarUrl: newThread.otherUser?.avatarUrl,
        },
        unreadCount: 0,
        product: productId ? {
          id: productId,
          title: productTitle || 'Ürün',
        } : undefined,
      };

      setThreads(prev => [transformedThread, ...prev]);
      setSelectedThread(transformedThread);
      
      // Pre-fill message with product reference
      if (productTitle) {
        setNewMessage(`Merhaba, "${productTitle}" ilanı hakkında bilgi almak istiyorum.\n\n`);
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
        toast.error('Sohbet başlatılamadı');
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
            displayName: isParticipant1 ? (t.participant2Name || 'Kullanıcı') : (t.participant1Name || 'Kullanıcı'),
            avatarUrl: null, // Backend doesn't provide avatarUrl in threads
          },
          lastMessage: t.lastMessage ? {
            ...t.lastMessage,
            isFromMe: t.lastMessage.senderId === user?.id,
          } : undefined,
          product: t.productId ? {
            id: t.productId,
            title: t.productTitle || 'Ürün',
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
      const filterResult = checkContentFilter(text);
      setContentWarning(filterResult.warning || null);
    } else {
      setContentWarning(null);
    }
  };

  const sendMessage = async () => {
    if (!selectedThread || !newMessage.trim() || sending) return;

    // Final content filter check
    const filterResult = checkContentFilter(newMessage);
    if (!filterResult.passed) {
      const confirm = window.confirm(
        `${filterResult.warning}\n\nYine de göndermek istiyor musunuz?`
      );
      if (!confirm) return;
    }

    setSending(true);
    try {
      const response = await messagesApi.sendMessage(selectedThread.id, newMessage.trim());
      const sentMessage = response.data.message || response.data;
      
      // Check if message was filtered by backend
      if (sentMessage.isFiltered || sentMessage.status === 'pending') {
        toast('Mesajınız incelenmek üzere gönderildi', { icon: '⚠️' });
      }

      setMessages((prev) => [...prev, sentMessage]);
      setNewMessage('');
      setContentWarning(null);
      loadThreads(); // Refresh threads to update last message
      
      // Scroll to bottom after sending new message
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      if (error.response?.data?.requiresApproval) {
        toast('Mesajınız incelenmek üzere gönderildi', { icon: '⚠️' });
      } else if (error.response?.data?.filtered) {
        toast.error('Mesajınız uygunsuz içerik nedeniyle engellenmiştir');
      } else {
        toast.error(error.response?.data?.message || 'Mesaj gönderilemedi');
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
            <h1 className="text-xl font-semibold">Mesajlar</h1>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
            </div>
          ) : threads.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 p-4 text-center">
              Henüz mesajınız yok
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
                    placeholder="Mesajınızı yazın..."
                    className={`flex-1 px-4 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400 ${
                      contentWarning ? 'border border-yellow-500' : ''
                    }`}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {sending ? '...' : 'Gönder'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  ℹ️ Mesajlar içerik filtresinden geçirilir. Kişisel bilgi paylaşımı engellenir.
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Bir sohbet seçin
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
