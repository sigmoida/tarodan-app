/**
 * J16 · Mesajlaşma — konuşma listesi (mobil UI dilimi).
 * Boş durum, misafir/giriş gerekli durumu, konuşma render + thread'e navigasyon,
 * günlük mesaj limiti banner'ı (UI göstergesi). Backend içerik filtresi/limit
 * uygulaması backend-only.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

import { pushMock as mockPush, resetRouterMocks } from '@/test-utils/router-mock';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/router-mock').routerMock,
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

let mockAuth: any = { isAuthenticated: true, user: { id: 'me' }, limits: { maxMessagesPerDay: 50 } };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

// Store artık client-only (getOtherParticipant + dailyMessageCount); selector-aware (#77).
let mockMessages: any;
jest.mock('@/stores/messagesStore', () => ({
  useMessagesStore: (sel?: any) => (sel ? sel(mockMessages) : mockMessages),
}));

// threads/unread artık React Query (#77) — hook'lar mock'lanır.
let mockThreadsQuery: any;
let mockUnread: any;
jest.mock('@/hooks/messaging', () => ({
  useThreadsQuery: () => mockThreadsQuery,
  useUnreadCountQuery: () => mockUnread,
}));

import MessagesTabScreen from '../messages';

function thread(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    participant1Id: 'me',
    participant2Id: 'u2',
    participant1: { id: 'me', displayName: 'Ben' },
    participant2: { id: 'u2', displayName: 'Ayşe' },
    product: { id: 'p1', title: 'Deri Ceket' },
    lastMessage: { content: 'Merhaba', senderId: 'u2', createdAt: new Date().toISOString() },
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    getOtherParticipant: (t: any) => (t.participant1Id === 'me' ? t.participant2 : t.participant1),
    dailyMessageCount: 0,
    ...overrides,
  };
}

/** threads query mock — data + isFetched (hasLoadedThreads) + refetch. */
function makeThreadsQuery(threads: any[] = []) {
  return { data: threads, isLoading: false, isFetched: true, refetch: jest.fn() };
}

describe('J16 · mesaj konuşma listesi', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockAuth = { isAuthenticated: true, user: { id: 'me' }, limits: { maxMessagesPerDay: 50 } };
    mockMessages = makeStore();
    mockThreadsQuery = makeThreadsQuery([]);
    mockUnread = { data: 0 };
  });

  it('J16.1 misafir kullanıcıya giriş yap çağrısı gösterir', () => {
    mockAuth = { isAuthenticated: false, user: null, limits: null };
    renderWithProviders(<MessagesTabScreen />);
    expect(screen.getByText('Mesajlarınızı görmek için giriş yapın')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Giriş Yap'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('J16.2 thread yoksa boş durum gösterir', () => {
    mockThreadsQuery = makeThreadsQuery([]);
    renderWithProviders(<MessagesTabScreen />);
    expect(screen.getByText('Henüz mesaj yok')).toBeOnTheScreen();
    expect(screen.getByText('Bir satıcıyla iletişime geçerek başlayın')).toBeOnTheScreen();
  });

  it('J16.3 thread render eder ve tıklayınca thread ekranına gider', () => {
    mockThreadsQuery = makeThreadsQuery([thread()]);
    renderWithProviders(<MessagesTabScreen />);
    expect(screen.getByText('Ayşe')).toBeOnTheScreen();
    expect(screen.getByText('Deri Ceket')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Ayşe'));
    expect(mockPush).toHaveBeenCalledWith('/messages/t1');
  });

  it('J16.4 limite yaklaşınca günlük mesaj banner gösterir', () => {
    mockMessages = makeStore({ dailyMessageCount: 45 });
    mockThreadsQuery = makeThreadsQuery([thread()]);
    renderWithProviders(<MessagesTabScreen />);
    expect(screen.getByText('Günlük mesaj: 45/50')).toBeOnTheScreen();
  });

  it('J16.5 limit dolunca Premium yükseltme bağlantısı gösterir', () => {
    mockMessages = makeStore({ dailyMessageCount: 50 });
    mockThreadsQuery = makeThreadsQuery([thread()]);
    renderWithProviders(<MessagesTabScreen />);
    fireEvent.press(screen.getByText("Premium'a Geç"));
    expect(mockPush).toHaveBeenCalledWith('/upgrade');
  });

  it('J16.6 limit uzaktayken banner gizli', () => {
    mockMessages = makeStore({ dailyMessageCount: 5 });
    mockThreadsQuery = makeThreadsQuery([thread()]);
    renderWithProviders(<MessagesTabScreen />);
    expect(screen.queryByText(/Günlük mesaj:/)).toBeNull();
  });
});
