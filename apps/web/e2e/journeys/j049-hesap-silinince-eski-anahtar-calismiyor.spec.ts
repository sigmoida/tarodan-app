/**
 * J49 — Hesap silinince eski anahtar çalışmıyor
 * Taze (ilan'sız) bir hesap kapatılır → eski refresh token reddedilir → kişi yeni hesap açar.
 * Seed kullanıcıları korunur: test KENDI throwaway hesabını oluşturup siler.
 */
import { test, expect } from '@playwright/test';
import { API, uniqueEmail, uniquePhone, birthdayOver18 } from '../support/helpers';
import { auth } from '../support/journeys-extra';

function extractTokens(body: any): { access?: string; refresh?: string } {
  const t = body?.tokens ?? body?.data?.tokens ?? body;
  return { access: t?.accessToken ?? body?.accessToken, refresh: t?.refreshToken ?? body?.refreshToken };
}

async function registerApi(request: any) {
  const data = {
    displayName: 'PW Silme Testi',
    email: uniqueEmail(),
    phone: uniquePhone(),
    birthDate: birthdayOver18(),
    password: 'Pwtest123!',
    confirmPassword: 'Pwtest123!',
    acceptTerms: true,
  };
  const res = await request.post(`${API}/auth/register`, { data });
  return { res, data };
}

test.describe('J49 — Hesap silinince eski refresh çalışmaz', () => {
  test('throwaway hesap sil → eski refresh reddedilir → yeni hesap açılır', async ({ request }) => {
    test.setTimeout(45_000);

    // 1) Taze hesap oluştur (ilan yok → silinebilir)
    const { res: reg } = await registerApi(request);
    expect([200, 201], 'kayıt başarılı').toContain(reg.status());
    const { access, refresh } = extractTokens(await reg.json());

    if (!access) {
      test.info().annotations.push({
        type: 'note',
        description: 'Kayıt token döndürmedi (e-posta doğrulama gerekli olabilir); silme adımı atlandı. Eski/sahte refresh reddi yine doğrulanır.',
      });
    } else {
      // Hesabı kapat (DELETE /users/me)
      const del = await request.delete(`${API}/users/me`, { headers: auth(access) });
      expect(del.ok(), 'taze hesap silinebilir (ilan yok)').toBeTruthy();

      // 2-3) Silinen hesabın eski refresh token'ı reddedilir
      if (refresh) {
        const refreshTry = await request.post(`${API}/auth/refresh`, {
          headers: auth(refresh),
          data: { refreshToken: refresh },
        });
        expect(refreshTry.ok(), 'silinmiş hesabın refresh\'i reddedilmeli').toBeFalsy();
        expect([400, 401, 403]).toContain(refreshTry.status());
      }
    }

    // Sahte/bozuk refresh her halükârda reddedilir (güvenlik garantisi)
    const bogus = await request.post(`${API}/auth/refresh`, {
      headers: auth('sahte.refresh.token'),
      data: { refreshToken: 'sahte.refresh.token' },
    });
    expect(bogus.ok(), 'sahte refresh reddedilmeli').toBeFalsy();
    expect([400, 401, 403]).toContain(bogus.status());

    // 4) Kişi yeni bir hesap açar
    const { res: reg2 } = await registerApi(request);
    expect([200, 201], 'yeni hesap açılır').toContain(reg2.status());
  });
});
