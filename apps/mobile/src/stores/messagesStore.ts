import { create } from 'zustand';
import { useAuthStore } from './authStore';

/**
 * #77 (CLAUDE.md §8): mesajlaşmanın server-state'i (threads/messages/unread) artık
 * React Query'de — bkz `@/hooks/messaging` (queries/mutations) + `@/lib/messaging`
 * (cache köprüsü, normalize). Bu store SADECE client/UI state tutar:
 *   - `currentThreadId`: açık thread — socket köprüsünün aktif thread'i bilmesi için,
 *   - `dailyMessageCount`/`dailyMessageLimit`: ücretsiz üye günlük mesaj limiti sayacı.
 * Tipler (MessageThread/Message) burada kalır; tüm tüketiciler buradan import eder.
 */

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
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const FREE_DAILY_MESSAGE_LIMIT = 50;

interface MessagesState {
  /** Açık thread'in id'si — socket köprüsü (useMessagingSocket) açık/kapalı ayrımı için. */
  currentThreadId: string | null;
  dailyMessageCount: number;
  dailyMessageLimit: number;

  // Actions (client-only)
  setCurrentThreadId: (threadId: string | null) => void;
  incrementDailyCount: () => void;
  resetDailyCount: () => void;

  // Helpers (saf — authStore okur, fetch YOK)
  canSendMessage: () => boolean;
  getOtherParticipant: (thread: MessageThread) => { id: string; displayName: string; avatarUrl?: string };
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  currentThreadId: null,
  dailyMessageCount: 0,
  dailyMessageLimit: FREE_DAILY_MESSAGE_LIMIT,

  setCurrentThreadId: (threadId) => set({ currentThreadId: threadId }),
  incrementDailyCount: () => set((state) => ({ dailyMessageCount: state.dailyMessageCount + 1 })),
  resetDailyCount: () => set({ dailyMessageCount: 0 }),

  canSendMessage: () => {
    const { dailyMessageCount } = get();
    const { limits } = useAuthStore.getState();

    // Premium üyeler sınırsız
    if (limits?.maxMessagesPerDay === -1) {
      return true;
    }

    const limit = limits?.maxMessagesPerDay || FREE_DAILY_MESSAGE_LIMIT;
    return dailyMessageCount < limit;
  },

  getOtherParticipant: (thread: MessageThread) => {
    const { user } = useAuthStore.getState();
    const currentUserId = user?.id;

    const defaultParticipant = {
      id: '',
      displayName: 'Kullanıcı',
      avatarUrl: undefined,
    };

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

    // Participant1 / Participant2 ile çöz
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
