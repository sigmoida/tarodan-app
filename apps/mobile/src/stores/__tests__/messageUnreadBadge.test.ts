// messagesApi'yi mock'la: markAsRead re-sync (fetchUnreadCount) sunucu gerçeğini döndürsün.
jest.mock('../../services/api', () => ({
  messagesApi: {
    markAsRead: jest.fn(() => Promise.resolve({ data: {} })),
    getUnreadCount: jest.fn(() => Promise.resolve({ data: { count: 0 } })),
  },
}));

import { useMessagesStore } from '../messagesStore';
import { useAuthStore } from '../authStore';

describe('okunmamış rozet (totalUnreadCount) davranışı', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'me' } as any });
    useMessagesStore.setState({
      currentThreadId: null,
      messages: [],
      threads: [{ id: 't1', unreadCount: 0 } as any],
      totalUnreadCount: 0,
    });
  });

  it('açık olmayan thread\'e başkasından mesaj gelince sayaçlar artar', () => {
    useMessagesStore.getState().applyIncomingMessage('t1', {
      id: 'm1', threadId: 't1', senderId: 'other', createdAt: '2026-06-22T10:00:00Z',
    } as any);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(1);
    expect(useMessagesStore.getState().threads.find((t: any) => t.id === 't1')!.unreadCount).toBe(1);
  });

  it('kendi gönderdiğim mesaj sayacı artırmaz', () => {
    useMessagesStore.getState().applyIncomingMessage('t1', {
      id: 'm2', threadId: 't1', senderId: 'me', createdAt: '2026-06-22T10:01:00Z',
    } as any);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0);
  });

  it('açık thread\'e gelen mesaj sayacı artırmaz', () => {
    useMessagesStore.setState({ currentThreadId: 't1' });
    useMessagesStore.getState().applyIncomingMessage('t1', {
      id: 'm3', threadId: 't1', senderId: 'other', createdAt: '2026-06-22T10:02:00Z',
    } as any);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0);
  });

  it('markAsRead rozeti thread.unreadCount kadar ANINDA düşürür (network beklemez)', () => {
    // Canlı gelen mesaj applyIncomingMessage ile thread.unreadCount=1 yapmıştı.
    useMessagesStore.setState({ totalUnreadCount: 1, threads: [{ id: 't1', unreadCount: 1 } as any] });
    // await etmeden senkron set sonucu kontrol et (optimistik, anında).
    void useMessagesStore.getState().markAsRead('t1');
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0);
    expect(useMessagesStore.getState().threads.find((t: any) => t.id === 't1')!.unreadCount).toBe(0);
  });

  it('gelen mesaj → açma → rozet anında temizlenir (uçtan uca optimistik)', () => {
    const store = useMessagesStore.getState();
    store.applyIncomingMessage('t1', { id: 'm9', threadId: 't1', senderId: 'other', createdAt: '2026-06-22T11:00:00Z' } as any);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(1); // canlı arttı
    void useMessagesStore.getState().markAsRead('t1');
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0); // açınca anında 0
  });
});
