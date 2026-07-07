/**
 * SecurityService.generateTOTPCode'un birebir replikası — verilen secret için
 * geçerli 6 haneli TOTP üretir (2FA enable/verify/disable senaryoları).
 * Kaynak: apps/api/test/e2e/2fa.e2e-spec.ts + apps/web/e2e/support/journeys-extra.ts.
 */
import * as crypto from 'crypto';

export function generateTOTPCode(secret: string, timeStep?: number): string {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secretBytes: number[] = [];
  for (const char of secret.toUpperCase()) {
    const idx = base32Chars.indexOf(char);
    if (idx >= 0) secretBytes.push(idx);
  }
  const time = timeStep ?? Math.floor(Date.now() / 1000 / 30);
  const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(time));
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}
