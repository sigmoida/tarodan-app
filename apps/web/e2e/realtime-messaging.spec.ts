/**
 * Realtime mesajlaşma (WebSocket) — iki kullanıcı AYNI thread'i açar; A mesaj gönderir,
 * B'nin AÇIK sohbetinde mesaj manuel yenileme OLMADAN birkaç saniye içinde belirir.
 * Yeni WebSocket gerçek-zamanlı mesaj katmanını doğrular.
 *
 * Konvansiyonlar (mevcut suite ile hizalı):
 *  - Auth: apiLogin (request fixture) ile token al → loginViaToken ile localStorage'a enjekte et
 *    (form login flakiness'i yok). USERS sözlüğü kullanılır.
 *  - Thread garantisi: iki kullanıcı arasında POST /messages/threads ile thread API'den
 *    oluşturulur (seed thread'e bel bağlamayız) → /messages?thread=<id> deep-link ile açılır.
 *  - Seçiciler gerçek UI'dan (src/app/messages/page.tsx):
 *      mesaj girişi: <Input type="text"> placeholder t('message.typeMessage')
 *        (tr "Mesajınızı yazın..." / en "Type your message...")
 *      gönder butonu: t('common.send') (tr "Gönder" / en "Send")
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, loginViaToken } from './support/helpers';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

test('alıcının açık sohbetinde gelen mesaj WebSocket ile anlık görünür', async ({ browser, request }) => {
  test.setTimeout(60_000);

  // 1) İki seed kullanıcı için token al (ahmet = satıcı/A, mehmet = alıcı/B).
  const tokenA = await apiLogin(request, USERS.sellerPremium); // ahmet@demo.com
  const tokenB = await apiLogin(request, USERS.buyer); // mehmet@demo.com
  const userA = await apiMe(request, tokenA);
  const userB = await apiMe(request, tokenB);
  expect(userA.id).not.toBe(userB.id);

  // 2) İkisi arasında thread'i API'den oluştur (varsa mevcut thread döner) → garanti.
  const thRes = await request.post(`${API}/messages/threads`, {
    headers: auth(tokenA),
    data: { recipientId: userB.id, message: 'Merhaba, gerçek zamanlı test sohbeti.' },
  });
  expect(thRes.ok(), `thread oluştu (${thRes.status()})`).toBeTruthy();
  const threadId = (await thRes.json()).id;
  expect(threadId, 'threadId').toBeTruthy();

  // 3) İki ayrı authenticated context — her biri token'ını localStorage'a enjekte eder.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await loginViaToken(pageA, tokenA);
  await loginViaToken(pageB, tokenB);

  // 4) İki taraf da AYNI thread'i deep-link ile açar (page.tsx ?thread=<id> auto-open eder).
  await pageA.goto(`/messages?thread=${threadId}`);
  await pageB.goto(`/messages?thread=${threadId}`);

  const inputRe = /Mesajınızı yazın|Type your message/i;
  const sendRe = /^(Gönder|Send)$/i;

  // Sohbetin açık olduğunu doğrula (mesaj girişi görünür).
  const inputA = pageA.getByPlaceholder(inputRe);
  await expect(inputA).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByPlaceholder(inputRe)).toBeVisible({ timeout: 15_000 });

  // 5) A benzersiz bir mesaj gönderir.
  const unique = `e2e-rt-${Date.now()}`;
  await inputA.fill(unique);
  await pageA.getByRole('button', { name: sendRe }).click();

  // 6) B'nin AÇIK sohbetinde mesaj REST refetch/refresh OLMADAN WebSocket ile belirmeli.
  await expect(pageB.getByText(unique)).toBeVisible({ timeout: 8_000 });

  await ctxA.close();
  await ctxB.close();
});
