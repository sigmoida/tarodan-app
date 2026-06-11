/**
 * J16 · Mesajlaşma — konuşma listesi (mobil UI dilimi).
 * Boş durum, misafir/giriş gerekli durumu, konuşma render + thread'e navigasyon,
 * günlük mesaj limiti banner'ı (UI göstergesi). Backend içerik filtresi/limit
 * uygulaması backend-only.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../src/test-utils';

import { pushMock as mockPush, resetRouterMocks } from '../../../src/test-utils/router-mock';

jest.mock('expo-router', () => ({
  ...require('../../../src/test-utils/router-mock').routerMock,
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../../src/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

let mockAuth: any = { isAuthenticated: true, user: { id: 'me' }, limits: { maxMessagesPerDay: 50 } };
jest.mock('../../../src/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

let mockMessages: any;
jest.mock('../../../src/stores/messagesStore', () => ({
  useMessagesStore: () => mockMessages,
}));

import MessagesListScreen from '../index';

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
    threads: [],
    isLoading: false,
    fetchThreads: jest.fn(),
    getUnreadCount: () => 0,
    getOtherParticipant: (t: any) => (t.participant1Id === 'me' ? t.participant2 : t.participant1),
    dailyMessageCount: 0,
    ...overrides,
  };
}

describe('J16 · mesaj konuşma listesi', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockAuth = { isAuthenticated: true, user: { id: 'me' }, limits: { maxMessagesPerDay: 50 } };
    mockMessages = makeStore();
  });

  it('J16.1 misafir kullanıcıya giriş yap çağrısı gösterir', () => {
    mockAuth = { isAuthenticated: false, user: null, limits: null };
    renderWithProviders(<MessagesListScreen />);
    expect(screen.getByText('Mesajlarınızı görmek için giriş yapın')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Giriş Yap'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('J16.2 thread yoksa boş durum gösterir', () => {
    mockMessages = makeStore({ threads: [] });
    renderWithProviders(<MessagesListScreen />);
    expect(screen.getByText('Henüz mesaj yok')).toBeOnTheScreen();
    expect(screen.getByText('Bir satıcıyla iletişime geçerek başlayın')).toBeOnTheScreen();
  });

  it('J16.3 thread render eder ve tıklayınca thread ekranına gider', () => {
    mockMessages = makeStore({ threads: [thread()] });
    renderWithProviders(<MessagesListScreen />);
    expect(screen.getByText('Ayşe')).toBeOnTheScreen();
    expect(screen.getByText('Deri Ceket')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Ayşe'));
    expect(mockPush).toHaveBeenCalledWith('/messages/t1');
  });

  it('J16.4 limite yaklaşınca günlük mesaj banner gösterir', () => {
    mockMessages = makeStore({ threads: [thread()], dailyMessageCount: 45 });
    renderWithProviders(<MessagesListScreen />);
    expect(screen.getByText('Günlük mesaj: 45/50')).toBeOnTheScreen();
  });

  it('J16.5 limit dolunca Premium yükseltme bağlantısı gösterir', () => {
    mockMessages = makeStore({ threads: [thread()], dailyMessageCount: 50 });
    renderWithProviders(<MessagesListScreen />);
    fireEvent.press(screen.getByText("Premium'a Geç"));
    expect(mockPush).toHaveBeenCalledWith('/upgrade');
  });

  it('J16.6 limit uzaktayken banner gizli', () => {
    mockMessages = makeStore({ threads: [thread()], dailyMessageCount: 5 });
    renderWithProviders(<MessagesListScreen />);
    expect(screen.queryByText(/Günlük mesaj:/)).toBeNull();
  });
});
