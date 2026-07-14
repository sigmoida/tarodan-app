import { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';
import { applyIncomingToCache, applyThreadReadToCache } from '@/lib/messaging/cache';
import type { Message, MessageThread } from '../messagesStore';

// #77: okunmamış rozet (qk.messaging.unreadCount) — eski totalUnreadCount davranışı,
// artık setQueryData köprüsüyle. applyIncomingToCache bump + applyThreadReadToCache düşüş.
describe('okunmamış rozet (unreadCount) cache davranışı', () => {
  let qc: QueryClient;
  const incoming = (id: string, senderId: string): Message =>
    ({ id, threadId: 't1', senderId, createdAt: '2026-06-22T10:00:00Z' } as Message);

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(qk.messaging.threads, [{ id: 't1', unreadCount: 0 } as MessageThread]);
    qc.setQueryData(qk.messaging.unreadCount, 0);
  });

  const unread = () => qc.getQueryData<number>(qk.messaging.unreadCount);
  const threadUnread = () =>
    qc.getQueryData<MessageThread[]>(qk.messaging.threads)!.find((t) => t.id === 't1')!.unreadCount;

  it('açık olmayan thread\'e başkasından mesaj gelince sayaçlar artar', () => {
    applyIncomingToCache(qc, 't1', incoming('m1', 'other'), { isOpen: false, myUserId: 'me' });
    expect(unread()).toBe(1);
    expect(threadUnread()).toBe(1);
  });

  it('kendi gönderdiğim mesaj sayacı artırmaz', () => {
    applyIncomingToCache(qc, 't1', incoming('m2', 'me'), { isOpen: false, myUserId: 'me' });
    expect(unread()).toBe(0);
  });

  it('açık thread\'e gelen mesaj sayacı artırmaz', () => {
    applyIncomingToCache(qc, 't1', incoming('m3', 'other'), { isOpen: true, myUserId: 'me' });
    expect(unread()).toBe(0);
  });

  it('markAsRead rozeti thread.unreadCount kadar ANINDA düşürür (network beklemez)', () => {
    qc.setQueryData(qk.messaging.unreadCount, 1);
    qc.setQueryData(qk.messaging.threads, [{ id: 't1', unreadCount: 1 } as MessageThread]);
    applyThreadReadToCache(qc, 't1');
    expect(unread()).toBe(0);
    expect(threadUnread()).toBe(0);
  });

  it('gelen mesaj → açma → rozet anında temizlenir (uçtan uca optimistik)', () => {
    applyIncomingToCache(qc, 't1', incoming('m9', 'other'), { isOpen: false, myUserId: 'me' });
    expect(unread()).toBe(1); // canlı arttı
    applyThreadReadToCache(qc, 't1');
    expect(unread()).toBe(0); // açınca anında 0
  });
});
