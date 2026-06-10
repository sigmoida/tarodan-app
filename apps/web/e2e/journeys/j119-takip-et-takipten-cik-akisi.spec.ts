/**
 * J119 — Takip et / takipten çık akışı
 * Kaynak: suite-a-auth.spec.ts (otomatik ayrıştırıldı). Tek senaryo = tek dosya.
 */
/**
 * SUITE A — Auth & Hesap (kısım 1): J42, J24, J48, J119.
 * Gerçek backend + tarodan_test + GERÇEK Mailhog (şifre sıfırlama maili okunur).
 * 2FA (J23/J47), change-password (J46), verify-expired (J45) ayrı eklenecek.
 */
import { test, expect } from '@playwright/test';
import { API, USERS, apiLogin, apiMe, fillRegisterForm, uniqueEmail } from '../support/helpers';
import { getLastEmailTo, extractLink, clearMailbox } from '../support/mail';

// ───────────── J42 — Yaş sınırı: 18 altı alınmıyor, 18+ kabul ─────────────

test.describe('J119 — Takip akışı', () => {
  test('başka kullanıcıyı takip/çık, kendini takip reddedilir', async ({ request }) => {
    const token = await apiLogin(request, USERS.buyerClean);
    const me = await apiMe(request, token);
    const headers = { Authorization: `Bearer ${token}` };

    // Takip edilecek başka kullanıcı (ahmet = satıcı)
    const target = await apiMe(request, await apiLogin(request, USERS.sellerPremium));
    const targetId = target?.id;
    expect(targetId, 'hedef kullanıcı id').toBeTruthy();

    // Takip et
    const follow = await request.post(`${API}/users/${targetId}/follow`, { headers });
    expect(follow.ok(), 'takip et').toBeTruthy();

    // Kendini takip → reddedilir
    const self = await request.post(`${API}/users/${me.id}/follow`, { headers });
    expect(self.ok(), 'kendini takip reddedilmeli').toBeFalsy();

    // Takipten çık
    const unfollow = await request.delete(`${API}/users/${targetId}/follow`, { headers });
    expect(unfollow.ok(), 'takipten çık').toBeTruthy();
  });
});
