/**
 * J103/J104 · Mesaj thread ekranı (mobil UI dilimi).
 * Mesaj render, input enable/disable (limit), gönder butonu enable/disable,
 * içerik filtresi uyarısı (telefon/IBAN vs → gönderim engellenir), limit banner.
 * Backend içerik filtresi uygulaması, escrow, onay akışı backend-only.
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';

import { resetRouterMocks } from '@/test-utils/router-mock';

jest.mock('expo-router', () => ({
  ...require('@/test-utils/router-mock').routerMock,
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ threadId: 't1' }),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('@/services/api', () => ({
  mediaApi: { uploadMessageImage: jest.fn() },
}));

let mockAuth: any = { user: { id: 'me' }, limits: { maxMessagesPerDay: 50 } };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: () => mockAuth,
}));

// Store client-only (getOtherParticipant/canSendMessage/setCurrentThreadId); selector-aware (#77).
let mockStore: any;
const useMessagesStoreMock: any = (sel?: any) => (sel ? sel(mockStore) : mockStore);
useMessagesStoreMock.getState = () => mockStore;
jest.mock('@/stores/messagesStore', () => ({
  useMessagesStore: useMessagesStoreMock,
}));

// thread/messages artık React Query, send/markRead mutation (#77).
let mockThreadQuery: any;
let mockMessagesQuery: any;
const mockSendMessage = jest.fn();
const mockMarkAsRead = jest.fn();
jest.mock('@/hooks/messaging', () => ({
  useThreadQuery: () => mockThreadQuery,
  useMessagesQuery: () => mockMessagesQuery,
  useSendMessage: () => ({ mutateAsync: mockSendMessage }),
  useMarkAsRead: () => ({ mutate: mockMarkAsRead }),
}));

import MessageThreadScreen from '../[threadId]';

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    threadId: 't1',
    senderId: 'u2',
    receiverId: 'me',
    content: 'Selam',
    status: 'read',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    getOtherParticipant: (t: any) => t.participant2,
    canSendMessage: () => true,
    setCurrentThreadId: jest.fn(),
    dailyMessageCount: 0,
    ...overrides,
  };
}

const CURRENT_THREAD = {
  id: 't1',
  participant1Id: 'me',
  participant2Id: 'u2',
  participant1: { id: 'me', displayName: 'Ben' },
  participant2: { id: 'u2', displayName: 'Ayşe' },
  product: { id: 'p1', title: 'Deri Ceket' },
  unreadCount: 0,
};
const makeThreadQuery = (thread: any = CURRENT_THREAD) => ({ data: thread });
const makeMessagesQuery = (messages: any[] = []) => ({ data: messages, isLoading: false });

describe('J103 · mesaj thread render & gönderim', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockSendMessage.mockReset().mockResolvedValue(true);
    mockMarkAsRead.mockReset();
    mockAuth = { user: { id: 'me' }, limits: { maxMessagesPerDay: 50 } };
    mockStore = makeStore();
    mockThreadQuery = makeThreadQuery();
    mockMessagesQuery = makeMessagesQuery([]);
  });

  it('J103.1 thread başlığı (karşı taraf) ve mesaj içeriği render eder', () => {
    mockMessagesQuery = makeMessagesQuery([message()]);
    renderWithProviders(<MessageThreadScreen />);
    expect(screen.getAllByText('Ayşe').length).toBeGreaterThan(0);
    expect(screen.getByText('Selam')).toBeOnTheScreen();
  });

  it('J103.2 sadece boşluk içeren input ile gönder çağrılmaz', () => {
    renderWithProviders(<MessageThreadScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Mesajınızı yazın...'), '   ');
    fireEvent.press(screen.UNSAFE_getByProps({ name: 'send' }).parent);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('J103.3 geçerli mesaj gönderilir', async () => {
    renderWithProviders(<MessageThreadScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Mesajınızı yazın...'), 'Merhaba');
    const sendBtn = screen.UNSAFE_getByProps({ name: 'send' }).parent;
    fireEvent.press(sendBtn);
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith({ threadId: 't1', content: 'Merhaba' }),
    );
  });
});

describe('J104 · içerik filtresi & mesaj limiti (UI göstergesi)', () => {
  beforeEach(() => {
    resetRouterMocks();
    mockSendMessage.mockReset().mockResolvedValue(true);
    mockMarkAsRead.mockReset();
    mockAuth = { user: { id: 'me' }, limits: { maxMessagesPerDay: 50 } };
    mockStore = makeStore();
    mockThreadQuery = makeThreadQuery();
    mockMessagesQuery = makeMessagesQuery([]);
  });

  it('J104.1 telefon numarası içeren mesaj engellenir + uyarı gösterilir', async () => {
    renderWithProviders(<MessageThreadScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Mesajınızı yazın...'), 'ara beni 0532 123 45 67');
    fireEvent.press(screen.UNSAFE_getByProps({ name: 'send' }).parent);
    await waitFor(() =>
      expect(screen.getByText(/Güvenliğiniz için bu mesaj gönderilemiyor/)).toBeOnTheScreen(),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('J104.2 IBAN içeren mesaj engellenir', async () => {
    renderWithProviders(<MessageThreadScreen />);
    fireEvent.changeText(
      screen.getByPlaceholderText('Mesajınızı yazın...'),
      'TR12 3456 7890 1234 5678 9012 34',
    );
    fireEvent.press(screen.UNSAFE_getByProps({ name: 'send' }).parent);
    await waitFor(() =>
      expect(screen.getByText(/Güvenliğiniz için bu mesaj gönderilemiyor/)).toBeOnTheScreen(),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('J104.3 limit dolunca input devre dışı (placeholder değişir) ve gönderim engellenir', () => {
    mockStore = makeStore({ canSendMessage: () => false });
    renderWithProviders(<MessageThreadScreen />);
    // canSend=false → input placeholder "Mesaj limiti doldu" + editable=false
    const input = screen.getByPlaceholderText('Mesaj limiti doldu');
    expect(input.props.editable).toBe(false);
    // "Mesajınızı yazın..." placeholder limit dolunca render edilmez
    expect(screen.queryByPlaceholderText('Mesajınızı yazın...')).toBeNull();
  });

  it('J104.4 premium (limitsiz) kullanıcıda limit uyarısı gösterilmez', () => {
    mockAuth = { user: { id: 'me' }, limits: { maxMessagesPerDay: -1 } };
    mockStore = makeStore({ canSendMessage: () => true });
    renderWithProviders(<MessageThreadScreen />);
    // limitsiz: aktif input placeholder'ı görünür, "limiti doldu" placeholder yok
    expect(screen.getByPlaceholderText('Mesajınızı yazın...').props.editable).toBe(true);
    expect(screen.queryByPlaceholderText('Mesaj limiti doldu')).toBeNull();
  });
});
