import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  decryptSecret,
  deriveSecretKey,
  encryptSecret,
} from "../../../common/security/secret-cipher";
import { isProduction } from "../../../config/environment";

/**
 * Sign in with Apple refresh token'larının durağan şifrelemesi. Şifreleme
 * ortak yardımcıdadır (`common/security/secret-cipher`); burada yalnız ANAHTAR
 * seçilir: `APPLE_TOKEN_ENCRYPTION_KEY` (kendi anahtarı — 2FA ya da posta
 * kutusu anahtarı döndürülünce Apple token'ları okunmaz hale gelmesin).
 *
 * Canlıda anahtar yoksa token ne yazılır ne okunur (`isAvailable() === false`):
 * giriş çalışır, iptal özelliği çalışmaz (saklama yok; kuyruktaki iptal
 * işleri hata verip yeniden denenir, bkz. `AppleTokenService`). Canlı dışında boş anahtar
 * JWT_SECRET'a düşer (2FA ve posta kutusu ile aynı geliştirme kolaylığı).
 */
@Injectable()
export class AppleTokenCipher {
  constructor(private readonly config: ConfigService) {}

  isAvailable(): boolean {
    return this.keyMaterial() !== null;
  }

  encrypt(plaintext: string): string {
    return encryptSecret(plaintext, this.key());
  }

  decrypt(encrypted: string): string {
    return decryptSecret(encrypted, this.key());
  }

  private key(): Buffer {
    const material = this.keyMaterial();
    if (material === null) {
      throw new Error("APPLE_TOKEN_ENCRYPTION_KEY is not configured");
    }
    return deriveSecretKey(material);
  }

  private keyMaterial(): string | null {
    const configured = this.config
      .get<string>("APPLE_TOKEN_ENCRYPTION_KEY")
      ?.trim();
    if (configured) return configured;
    if (isProduction()) return null;
    return this.config.get<string>("JWT_SECRET")?.trim() || null;
  }
}
