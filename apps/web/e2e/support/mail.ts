/**
 * Mailhog yardımcıları — gerçek mail teyidi (Kural 3).
 * API test ortamı SMTP'yi Mailhog'a (1025) yollar; mailleri Mailhog API'sinden (8025)
 * GERÇEK okuyup içerik/link/kod assert ederiz.
 */
import { APIRequestContext } from '@playwright/test';

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
  // quoted-printable
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** MIME encoded-word subject (=?UTF-8?Q?..?= / =?UTF-8?B?..?=) çöz — Türkçe karakterler
 *  (ğ=C4=9F gibi) encoded geldiği için regex eşleşmeleri patlıyordu. */
function decodeMimeWord(s: string): string {
  if (!s) return s;
  return s
    .replace(/=\?[^?]+\?[Bb]\?([^?]*)\?=/g, (_m, t) => {
      try { return Buffer.from(t, 'base64').toString('utf8'); } catch { return t; }
    })
    .replace(/=\?[^?]+\?[Qq]\?([^?]*)\?=/g, (_m, t) => {
      const bytes = String(t).replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
      try { return Buffer.from(bytes, 'latin1').toString('utf8'); } catch { return bytes; }
    });
}

/** Adrese gelen EN SON maili getir — mail asenkron geldiği için retry'li bekler. */
export async function getLastEmailTo(
  request: APIRequestContext,
  email: string,
  timeoutMs = 20000,
): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`${MAILHOG}/api/v2/search`, {
      params: { kind: 'to', query: email },
    });
    if (res.ok()) {
      const data = await res.json();
      const items: any[] = data?.items ?? [];
      if (items.length > 0) {
        const m = items[0]; // Mailhog en yeniyi başa koyar
        const headers = m?.Content?.Headers ?? {};
        return {
          subject: decodeMimeWord(headers.Subject?.[0] ?? ''),
          to: headers.To?.[0] ?? email,
          body: decodeBody(m?.Content?.Body ?? '', headers),
        };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Mailhog'da '${email}' adresine mail bulunamadı (${timeoutMs}ms)`);
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
  // Önce "kod(unuz)" / "code" kelimesinin hemen ardındaki kodu ara — HTML head'deki rastgele
  // 6-haneli sayıları (renk/timestamp) yanlışlıkla almasın.
  const near = text.match(new RegExp(`kod[^\\d]{0,40}?(\\d{${digits}})`, 'i')) ??
    text.match(new RegExp(`code[^\\d]{0,40}?(\\d{${digits}})`, 'i'));
  if (near?.[1]) return near[1];
  const m = text.match(new RegExp(`\\b(\\d{${digits}})\\b`));
  return m?.[1] ?? null;
}

/** Tüm mailleri temizle (test izolasyonu için). */
export async function clearMailbox(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILHOG}/api/v1/messages`).catch(() => {});
}
