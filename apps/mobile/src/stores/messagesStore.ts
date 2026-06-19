import { create } from 'zustand';
import { messagesApi } from '../services/api';
import { useAuthStore } from './authStore';

export interface MessageThread {
  id: string;
  participant1Id: string;
  participant2Id: string;
  participant1: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  participant2: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  productId?: string;
  product?: {
    id: string;
    title: string;
    images?: Array<{ url: string }>;
  };
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
  };
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  receiverId: string;
  content: string;
  status: 'sent' | 'delivered' | 'read' | 'pending_approval' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

interface MessagesState {
  threads: MessageThread[];
  currentThread: MessageThread | null;
  // Açık olan thread'in id'si — thread değişiminde stale mesajları temizlemek için.
  currentThreadId: string | null;
  messages: Message[];
  isLoading: boolean;
  // İlk fetchThreads tamamlandı mı — tab açılışında boş ekran/spinner çakmasını önler.
  hasLoadedThreads: boolean;
  isLoadingMessages: boolean;
  error: string | null;
  dailyMessageCount: number;
  dailyMessageLimit: number;
  // Tüm thread'lerdeki toplam okunmamış — sayfalamadan bağımsız sunucu agregatı (header rozeti).
  totalUnreadCount: number;

  // Actions
  fetchThreads: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  fetchThread: (threadId: string) => Promise<void>;
  fetchMessages: (threadId: string, page?: number) => Promise<void>;
  sendMessage: (threadId: string, content: string) => Promise<boolean>;
  createThread: (recipientId: string, content: string, productId?: string) => Promise<string | null>;
  markAsRead: (threadId: string) => Promise<void>;
  applyIncomingMessage: (threadId: string, message: any) => void;

  // Helpers
  getUnreadCount: () => number;
  canSendMessage: () => boolean;
  getOtherParticipant: (thread: MessageThread) => { id: string; displayName: string; avatarUrl?: string };
}

/**
 * API thread'leri düz alanlarla döndürür (participant1Id/Name/AvatarUrl,
 * participant2...). Web (apps/web messages/page.tsx) bunu otherUser'a çevirir.
 * Mobil getOtherParticipant nested participant1/participant2 objesi beklediği
 * için burada düz alanları nesneye normalize ediyoruz — yoksa isim 'Kullanıcı'
 * görünür. Hem fetchThreads hem fetchThread bu helper'ı kullanır.
 */
function normalizeThread(t: any): MessageThread {
  if (!t || typeof t !== 'object') return t;
  const participant1 =
    t.participant1 && typeof t.participant1 === 'object'
      ? t.participant1
      : {
          id: t.participant1Id || t.sender?.id || '',
          displayName: t.participant1Name || t.sender?.displayName || 'Kullanıcı',
          avatarUrl: t.participant1AvatarUrl || t.sender?.avatarUrl || undefined,
        };
  const participant2 =
    t.participant2 && typeof t.participant2 === 'object'
      ? t.participant2
      : {
          id: t.participant2Id || t.otherUser?.id || t.receiver?.id || '',
          displayName:
            t.participant2Name || t.otherUser?.displayName || t.receiver?.displayName || 'Kullanıcı',
          avatarUrl:
            t.participant2AvatarUrl || t.otherUser?.avatarUrl || t.receiver?.avatarUrl || undefined,
        };
  return {
    ...t,
    participant1Id: t.participant1Id || participant1.id,
    participant2Id: t.participant2Id || participant2.id,
    participant1,
    participant2,
    unreadCount: t.unreadCount || 0,
  };
}

const FREE_DAILY_MESSAGE_LIMIT = 50;

export const useMessagesStore = create<MessagesState>((set, get) => ({
  threads: [],
  currentThread: null,
  currentThreadId: null,
  messages: [],
  isLoading: false,
  hasLoadedThreads: false,
  isLoadingMessages: false,
  error: null,
  dailyMessageCount: 0,
  dailyMessageLimit: FREE_DAILY_MESSAGE_LIMIT,
  totalUnreadCount: 0,

  // Web ile aynı endpoint: GET /messages/threads
  fetchThreads: async () => {
    set({ isLoading: true, error: null });
    try {
      // Thread listesi (sayfalı) + toplam okunmamış (sayfalama bağımsız) paralel.
      const [response, unreadRes] = await Promise.all([
        messagesApi.getThreads(),
        messagesApi.getUnreadCount().catch(() => null),
      ]);
      const threadsData = response.data?.threads || response.data?.data || response.data || [];

      // Normalize thread data — düz API alanlarını nested participant objesine çevir.
      const normalizedThreads = (Array.isArray(threadsData) ? threadsData : []).map(normalizeThread);

      // Backend toplam okunmamış; ulaşılamazsa yüklü sayfadan türet (fallback).
      const c = (unreadRes?.data as any)?.count;
      set({
        threads: normalizedThreads,
        isLoading: false,
        hasLoadedThreads: true,
        totalUnreadCount: typeof c === 'number'
          ? c
          : normalizedThreads.reduce((t, th) => t + (th.unreadCount || 0), 0),
      });
    } catch (error: any) {
      console.error('Failed to fetch threads:', error);
      set({ error: 'Mesajlar yüklenemedi', isLoading: false, hasLoadedThreads: true, threads: [] });
    }
  },

  // Sadece toplam okunmamış sayısını tazele (tab rozeti için, thread listesi gerekmeden).
  fetchUnreadCount: async () => {
    try {
      const res = await messagesApi.getUnreadCount();
      const c = (res.data as any)?.count;
      if (typeof c === 'number') set({ totalUnreadCount: c });
    } catch {
      // sessiz geç — mevcut değer korunur
    }
  },

  // Web ile aynı endpoint: GET /messages/threads/:id
  fetchThread: async (threadId: string) => {
    // Farklı thread'e geçildiyse eski kişinin adı/avatarı header'da görünmesin.
    if (get().currentThread?.id !== threadId) {
      set({ currentThread: null });
    }
    try {
      const response = await messagesApi.getThread(threadId);
      const raw = (response.data as any)?.data ?? response.data;
      set({ currentThread: raw ? normalizeThread(raw) : null });
    } catch (error: any) {
      console.error('Failed to fetch thread:', error);
      set({ error: 'Mesaj konusu yüklenemedi' });
    }
  },

  // Web ile aynı endpoint: GET /messages/threads/:id/messages
  fetchMessages: async (threadId: string, page: number = 1) => {
    // Thread değiştiyse önceki konuşmanın mesajları bir an bile görünmesin;
    // aynı thread'de sessiz yenileme (mevcut mesajlar ekranda kalır).
    if (get().currentThreadId !== threadId) {
      set({ messages: [], currentThreadId: threadId, isLoadingMessages: true });
    } else {
      set({ isLoadingMessages: true });
    }
    try {
      const response = await messagesApi.getMessages(threadId, { page, pageSize: 50 });
      const messagesData = response.data?.messages || response.data?.data || response.data || [];

      // API mesajları en yeni → en eski döndürür (createdAt desc). Sohbet ekranı
      // (en eski üstte, en yeni altta) ve scrollToEnd doğru çalışsın diye web
      // (apps/web messages/page.tsx:211) ile aynı şekilde artan sıraya çeviriyoruz.
      const sorted = (Array.isArray(messagesData) ? messagesData : [])
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      set({
        messages: sorted,
        isLoadingMessages: false,
      });
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      set({ error: 'Mesajlar yüklenemedi', isLoadingMessages: false, messages: [] });
    }
  },

  // Web ile aynı endpoint: POST /messages/threads/:id/messages
  sendMessage: async (threadId: string, content: string) => {
    const { dailyMessageCount, dailyMessageLimit, canSendMessage } = get();
    
    // Check daily limit for free members
    if (!canSendMessage()) {
      set({ error: 'Günlük mesaj limitine ulaştınız' });
      return false;
    }

    try {
      const response = await messagesApi.sendMessage(threadId, content);
      
      // Add new message to the list
      const newMessage = response.data;
      set(state => ({
        messages: [...state.messages, newMessage],
        dailyMessageCount: state.dailyMessageCount + 1,
      }));

      // Update thread's last message
      set(state => ({
        threads: state.threads.map(thread => 
          thread.id === threadId 
            ? { 
                ...thread, 
                lastMessage: { 
                  content, 
                  senderId: newMessage.senderId, 
                  createdAt: newMessage.createdAt 
                },
                updatedAt: newMessage.createdAt,
              }
            : thread
        ),
      }));

      return true;
    } catch (error: any) {
      console.error('Failed to send message:', error);
      set({ error: error.response?.data?.message || 'Mesaj gönderilemedi' });
      return false;
    }
  },

  // Web ile aynı endpoint: POST /messages/threads
  createThread: async (recipientId: string, content: string, productId?: string) => {
    const { canSendMessage } = get();
    
    if (!canSendMessage()) {
      set({ error: 'Günlük mesaj limitine ulaştınız' });
      return null;
    }

    try {
      const response = await messagesApi.createThread({ 
        participantId: recipientId, 
        productId 
      });
      const newThread = response.data;

      // Send the first message
      if (content) {
        await messagesApi.sendMessage(newThread.id, content);
      }

      // Backend findOrCreate yaptığı için mevcut thread dönebilir; aynı id'yi
      // ikinci kez eklemek listede duplicate key hatasına yol açar — dedupe et.
      set(state => ({
        threads: [
          newThread,
          ...state.threads.filter(t => t.id !== newThread.id),
        ],
        dailyMessageCount: state.dailyMessageCount + 1,
      }));

      return newThread.id;
    } catch (error: any) {
      console.error('Failed to create thread:', error);
      set({ error: error.response?.data?.message || 'Mesaj gönderilemedi' });
      return null;
    }
  },

  // Web ile aynı endpoint: POST /messages/threads/:id/read
  markAsRead: async (threadId: string) => {
    set(state => {
      const prevUnread = state.threads.find(t => t.id === threadId)?.unreadCount || 0;
      return {
        threads: state.threads.map(thread =>
          thread.id === threadId ? { ...thread, unreadCount: 0 } : thread
        ),
        messages: state.messages.map(msg =>
          msg.threadId === threadId ? { ...msg, status: 'read' as const } : msg
        ),
        // Header rozetini de senkron tut (optimistik düşüş).
        totalUnreadCount: Math.max(0, state.totalUnreadCount - prevUnread),
      };
    });

    try {
      await messagesApi.markAsRead(threadId);
    } catch {
      // endpoint may not exist yet - local state already updated
    }
  },

  applyIncomingMessage: (threadId, message) => {
    const state = get();
    // Açık thread ise mesaj listesine id-dedupe ile ekle, createdAt'e göre sırala
    if (state.currentThreadId === threadId) {
      const exists = state.messages.some((m: any) => m.id === message.id);
      if (!exists) {
        const next = [...state.messages, message].sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        set({ messages: next });
      }
    }
    // Önizleme: ilgili thread'in lastMessage'ını güncelle
    set({
      threads: get().threads.map((t: any) =>
        t.id === threadId ? { ...t, lastMessage: message, lastMessageAt: message.createdAt } : t,
      ),
    });
  },

  getUnreadCount: () => {
    // Sayfalama bağımsız sunucu toplamı; thread sayfasının kısmi toplamı değil.
    return get().totalUnreadCount;
  },

  canSendMessage: () => {
    const { dailyMessageCount, dailyMessageLimit } = get();
    const { limits } = useAuthStore.getState();
    
    // Premium users have unlimited messages
    if (limits?.maxMessagesPerDay === -1) {
      return true;
    }
    
    const limit = limits?.maxMessagesPerDay || FREE_DAILY_MESSAGE_LIMIT;
    return dailyMessageCount < limit;
  },

  getOtherParticipant: (thread: MessageThread) => {
    const { user } = useAuthStore.getState();
    const currentUserId = user?.id;
    
    // Güvenli varsayılan değer
    const defaultParticipant = { 
      id: '', 
      displayName: 'Kullanıcı', 
      avatarUrl: undefined 
    };
    
    // Thread yoksa varsayılan dön
    if (!thread) {
      return defaultParticipant;
    }
    
    // API'den otherUser olarak gelebilir
    if ((thread as any).otherUser) {
      const otherUser = (thread as any).otherUser;
      return {
        id: otherUser.id || '',
        displayName: otherUser.displayName || otherUser.name || 'Kullanıcı',
        avatarUrl: otherUser.avatarUrl || otherUser.avatar || undefined,
      };
    }
    
    // Participant1 ve Participant2 ile kontrol
    if (thread.participant1Id === currentUserId) {
      if (!thread.participant2) return defaultParticipant;
      return {
        id: thread.participant2.id || '',
        displayName: thread.participant2.displayName || 'Kullanıcı',
        avatarUrl: thread.participant2.avatarUrl,
      };
    }
    
    if (!thread.participant1) return defaultParticipant;
    return {
      id: thread.participant1.id || '',
      displayName: thread.participant1.displayName || 'Kullanıcı',
      avatarUrl: thread.participant1.avatarUrl,
    };
  },
}));

export default useMessagesStore;
