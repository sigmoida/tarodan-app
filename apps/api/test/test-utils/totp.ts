/**
 * API'nin RFC 6238 implementasyonuyla verilen secret için geçerli TOTP üretir.
 */
import { generateTotpCode } from '../../src/modules/security/totp.util';

export function generateTOTPCode(secret: string, timeStep?: number): string {
  const time = timeStep ?? Math.floor(Date.now() / 1000 / 30);
  return generateTotpCode(secret, time);
}
