import { create } from 'zustand';
import { api } from '../services/api';
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
  messages: Message[];
  isLoading: boolean;
  isLoadingMessages: boolean;
  error: string | null;
  dailyMessageCount: number;
  dailyMessageLimit: number;
  
  // Actions
  fetchThreads: () => Promise<void>;
  fetchThread: (threadId: string) => Promise<void>;
  fetchMessages: (threadId: string, page?: number) => Promise<void>;
  sendMessage: (threadId: string, content: string) => Promise<boolean>;
  createThread: (recipientId: string, content: string, productId?: string) => Promise<string | null>;
  markAsRead: (threadId: string) => Promise<void>;
  
  // Helpers
  getUnreadCount: () => number;
  canSendMessage: () => boolean;
  getOtherParticipant: (thread: MessageThread) => { id: string; displayName: string; avatarUrl?: string };
}

const FREE_DAILY_MESSAGE_LIMIT = 50;

export const useMessagesStore = create<MessagesState>((set, get) => ({
  threads: [],
  currentThread: null,
  messages: [],
  isLoading: false,
  isLoadingMessages: false,
  error: null,
  dailyMessageCount: 0,
  dailyMessageLimit: FREE_DAILY_MESSAGE_LIMIT,

  fetchThreads: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/messages/threads');
      const threadsData = response.data?.threads || response.data?.data || response.data || [];
      
      set({ 
        threads: Array.isArray(threadsData) ? threadsData : [], 
        isLoading: false 
      });
    } catch (error: any) {
      console.error('Failed to fetch threads:', error);
      set({ error: 'Mesajlar yüklenemedi', isLoading: false, threads: [] });
    }
  },

  fetchThread: async (threadId: string) => {
    try {
      const response = await api.get(`/messages/threads/${threadId}`);
      set({ currentThread: response.data });
    } catch (error: any) {
      console.error('Failed to fetch thread:', error);
      set({ error: 'Mesaj konusu yüklenemedi' });
    }
  },

  fetchMessages: async (threadId: string, page: number = 1) => {
    set({ isLoadingMessages: true });
    try {
      const response = await api.get(`/messages/threads/${threadId}/messages`, {
        params: { page, pageSize: 50 }
      });
      const messagesData = response.data?.messages || response.data?.data || response.data || [];
      
      set({ 
        messages: Array.isArray(messagesData) ? messagesData : [], 
        isLoadingMessages: false 
      });
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      set({ error: 'Mesajlar yüklenemedi', isLoadingMessages: false, messages: [] });
    }
  },

  sendMessage: async (threadId: string, content: string) => {
    const { dailyMessageCount, dailyMessageLimit, canSendMessage } = get();
    
    // Check daily limit for free members
    if (!canSendMessage()) {
      set({ error: 'Günlük mesaj limitine ulaştınız' });
      return false;
    }

    try {
      const response = await api.post(`/messages/threads/${threadId}/messages`, { content });
      
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

  createThread: async (recipientId: string, content: string, productId?: string) => {
    const { canSendMessage } = get();
    
    if (!canSendMessage()) {
      set({ error: 'Günlük mesaj limitine ulaştınız' });
      return null;
    }

    try {
      const payload: any = { recipientId, content };
      if (productId) {
        payload.productId = productId;
      }

      const response = await api.post('/messages/threads', payload);
      const newThread = response.data;

      // Add to threads list
      set(state => ({
        threads: [newThread, ...state.threads],
        dailyMessageCount: state.dailyMessageCount + 1,
      }));

      return newThread.id;
    } catch (error: any) {
      console.error('Failed to create thread:', error);
      set({ error: error.response?.data?.message || 'Mesaj gönderilemedi' });
      return null;
    }
  },

  markAsRead: async (threadId: string) => {
    try {
      await api.patch(`/messages/threads/${threadId}/read`);
      
      // Update local state
      set(state => ({
        threads: state.threads.map(thread =>
          thread.id === threadId ? { ...thread, unreadCount: 0 } : thread
        ),
        messages: state.messages.map(msg =>
          msg.threadId === threadId ? { ...msg, status: 'read' as const } : msg
        ),
      }));
    } catch (error: any) {
      console.error('Failed to mark as read:', error);
    }
  },

  getUnreadCount: () => {
    return get().threads.reduce((total, thread) => total + (thread.unreadCount || 0), 0);
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
    
    if (thread.participant1Id === currentUserId) {
      return thread.participant2;
    }
    return thread.participant1;
  },
}));

export default useMessagesStore;
