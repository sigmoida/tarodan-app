/**
 * MailHog yardımcıları — API E2E için gerçek mail teyidi.
 *
 * .env.test SMTP'yi MailHog'a (1025) yollar; mailleri MailHog API'sinden (8025)
 * GERÇEK okuyup içerik/link/kod assert ederiz. Web paketindeki
 * apps/web/e2e/support/mail.ts ile aynı mantık, Playwright yerine global fetch.
 *
 * NOT: Mail yan etkisi çoğu senaryoda DB'den de doğrulanabilir
 * (email_verification_tokens / email_logs). MailHog assertion'ı ikincildir;
 * MailHog servisi yoksa (lokal docker kapalı) bu yardımcılar timeout atar.
 */

const MAILHOG = process.env.MAILHOG_URL ?? 'http://localhost:8025';

export interface MailMessage {
  subject: string;
  to: string;
  body: string;
}

/** quoted-printable / base64 gövdeyi çöz. */
function decodeBody(body: string, headers: Record<string, string[]>): string {
  const enc = (headers['Content-Transfer-Encoding']?.[0] ?? '').toLowerCase();
  if (enc.includes('base64')) {
    try {
      return Buffer.from(body.replace(/\r?\n/g, ''), 'base64').toString('utf8');
    } catch {
      return body;
    }
  }
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** MIME encoded-word subject (=?UTF-8?Q?..?= / =?UTF-8?B?..?=) çöz (Türkçe karakterler). */
function decodeMimeWord(s: string): string {
  if (!s) return s;
  return s
    .replace(/=\?[^?]+\?[Bb]\?([^?]*)\?=/g, (_m, t) => {
      try {
        return Buffer.from(t, 'base64').toString('utf8');
      } catch {
        return t;
      }
    })
    .replace(/=\?[^?]+\?[Qq]\?([^?]*)\?=/g, (_m, t) => {
      const bytes = String(t)
        .replace(/_/g, ' ')
        .replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
      try {
        return Buffer.from(bytes, 'latin1').toString('utf8');
      } catch {
        return bytes;
      }
    });
}

/** Adrese gelen EN SON maili getir — mail asenkron geldiği için retry'li bekler. */
export async function getLastEmailTo(email: string, timeoutMs = 20000): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  const url = `${MAILHOG}/api/v2/search?kind=to&query=${encodeURIComponent(email)}`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        const items: any[] = data?.items ?? [];
        if (items.length > 0) {
          const m = items[0]; // MailHog en yeniyi başa koyar
          const headers = m?.Content?.Headers ?? {};
          return {
            subject: decodeMimeWord(headers.Subject?.[0] ?? ''),
            to: headers.To?.[0] ?? email,
            body: decodeBody(m?.Content?.Body ?? '', headers),
          };
        }
      }
    } catch {
      /* MailHog henüz hazır değil — retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`MailHog'da '${email}' adresine mail bulunamadı (${timeoutMs}ms)`);
}

/** Gövdeden link çıkar (opsiyonel path ipucuyla, ör. 'verify-email'). */
export function extractLink(body: string, pathHint?: string): string | null {
  const urls = body.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  if (pathHint) return urls.find((u) => u.includes(pathHint)) ?? urls[0] ?? null;
  return urls[0] ?? null;
}

/** Gövdeden N-haneli kod çıkar (2FA / OTP). */
export function extractCode(body: string, digits = 6): string | null {
  const text = body.replace(/<[^>]+>/g, ' ');
  const near =
    text.match(new RegExp(`kod[^\\d]{0,40}?(\\d{${digits}})`, 'i')) ??
    text.match(new RegExp(`code[^\\d]{0,40}?(\\d{${digits}})`, 'i'));
  if (near?.[1]) return near[1];
  const m = text.match(new RegExp(`\\b(\\d{${digits}})\\b`));
  return m?.[1] ?? null;
}

/** Tüm mailleri temizle (test izolasyonu için). beforeEach'te clearMailbox() çağırın. */
export async function clearMailbox(): Promise<void> {
  try {
    await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' });
  } catch {
    /* yok say */
  }
}
