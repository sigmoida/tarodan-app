import { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';
import { applyIncomingToCache } from '@/lib/messaging/cache';
import type { Message } from '../messagesStore';

// #77: applyIncomingMessage store action'ı → setQueryData köprüsü (cache.ts).
// Aynı davranış: açık thread'e id-dedupe append, kapalı thread'e append yok.
describe('applyIncomingToCache — gelen mesaj liste davranışı', () => {
  let qc: QueryClient;
  const m1 = { id: 'm1', threadId: 't1', createdAt: '2026-06-19T10:00:00Z' } as Message;

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(qk.messaging.messages('t1'), [m1]);
    qc.setQueryData(qk.messaging.threads, []);
  });

  it('açık thread\'e yeni mesajı dedupe ile ekler', () => {
    const m2 = { id: 'm2', threadId: 't1', createdAt: '2026-06-19T10:01:00Z' } as Message;
    applyIncomingToCache(qc, 't1', m2, { isOpen: true, myUserId: 'me' });
    expect(qc.getQueryData<Message[]>(qk.messaging.messages('t1'))!.map((m) => m.id)).toEqual([
      'm1',
      'm2',
    ]);
    // aynı mesaj tekrar → dedupe
    applyIncomingToCache(qc, 't1', m2, { isOpen: true, myUserId: 'me' });
    expect(qc.getQueryData<Message[]>(qk.messaging.messages('t1'))!.length).toBe(2);
  });

  it('thread açık DEĞİLKEN mesaj listesine eklemez', () => {
    const x = { id: 'x', threadId: 'OTHER', createdAt: '2026-06-19T10:05:00Z' } as Message;
    applyIncomingToCache(qc, 'OTHER', x, { isOpen: false, myUserId: 'me' });
    // açık t1 listesi değişmez; kapalı OTHER listesi hiç yazılmaz
    expect(qc.getQueryData<Message[]>(qk.messaging.messages('t1'))!.map((m) => m.id)).toEqual(['m1']);
    expect(qc.getQueryData(qk.messaging.messages('OTHER'))).toBeUndefined();
  });
});
